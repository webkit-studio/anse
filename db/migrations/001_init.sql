-- 001: kompletní schéma aplikace Anse zakázky.
-- Idempotentní není — spouští se přes scripts/migrate.ts, který eviduje aplikované migrace.

-- ---------------------------------------------------------------------------
-- Pomocné funkce (bez závislosti na contrib rozšířeních — funguje na Supabase
-- i na čistém lokálním Postgresu)
-- ---------------------------------------------------------------------------

-- updated_at trigger
create or replace function set_updated_at() returns trigger
language plpgsql as $$
begin
  new.updated_at = now();
  return new;
end $$;

-- Odstranění české/slovenské diakritiky + lowercase pro vyhledávání.
-- IMMUTABLE ⇒ lze později indexovat.
create or replace function unaccent_cz(t text) returns text
language sql immutable as $$
  select lower(translate(
    t,
    'áäčďéěëíĺľňóôöőřŕšťúůüűýžÁÄČĎÉĚËÍĹĽŇÓÔÖŐŘŔŠŤÚŮÜŰÝŽ',
    'aacdeeeillnooooerrstuuuuyzAACDEEEILLNOOOOERRSTUUUUYZ'
  ))
$$;

-- ---------------------------------------------------------------------------
-- Tabulky
-- ---------------------------------------------------------------------------

create table users (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  code char(6) not null unique check (code ~ '^[0-9]{6}$'),
  role text not null check (role in ('technik', 'admin')),
  active boolean not null default true,
  created_at timestamptz not null default now()
);

create table clients (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  contact_person text not null default '',
  address text not null default '',
  delivery_address text not null default '',
  phone text not null default '',
  email text not null default '',
  ico text not null default '',
  dic text not null default '',
  note text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger clients_updated_at before update on clients
  for each row execute procedure set_updated_at();

create table orders (
  id uuid primary key default gen_random_uuid(),
  client_id uuid not null references clients (id),
  installation_address text not null default '',
  montage_number text not null default '',
  order_number text not null default '',
  status text not null default 'rozpracovana'
    check (status in ('k_vymereni', 'rozpracovana', 'k_objednani', 'objednano', 'namontovano')),
  measured_at date,
  delivery_date date,
  invoice_number text not null default '',
  note text not null default '',
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);
create trigger orders_updated_at before update on orders
  for each row execute procedure set_updated_at();

create index orders_status_idx on orders (status);
create index orders_client_idx on orders (client_id);
create index orders_created_idx on orders (created_at desc);

-- Audit přechodů stavů; později kotva pro exactly-once e-mail notifikaci.
create table order_events (
  id bigint generated always as identity primary key,
  order_id uuid not null references orders (id) on delete cascade,
  user_id uuid not null references users (id),
  from_status text not null,
  to_status text not null,
  created_at timestamptz not null default now()
);
create index order_events_order_idx on order_events (order_id);

create table rooms (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  name text not null,
  note text not null default '',
  position integer not null,
  -- cíl složené FK z items: položka nikdy nemůže ukazovat do místnosti cizí zakázky
  unique (id, order_id),
  unique (order_id, position)
);

create table product_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique,
  name text not null,
  manufacturer text not null check (manufacturer in ('jackwest', 'neva', 'susy')),
  active boolean not null default true,
  current_definition_id uuid, -- FK doplněna níže (cyklus s form_definitions)
  sort integer not null default 0
);

-- Verzované definice formulářů: po prvním použití immutable, změna = nová verze.
create table form_definitions (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types (id) on delete cascade,
  version integer not null,
  definition jsonb not null,
  created_at timestamptz not null default now(),
  unique (product_type_id, version)
);

alter table product_types
  add constraint product_types_current_definition_fk
  foreign key (current_definition_id) references form_definitions (id);

create table items (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  room_id uuid not null,
  product_type_id uuid not null references product_types (id),
  form_definition_id uuid not null references form_definitions (id),
  params jsonb not null default '{}',
  note text not null default '',
  position integer not null,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  foreign key (room_id, order_id) references rooms (id, order_id) on delete cascade,
  unique (room_id, position)
);
create trigger items_updated_at before update on items
  for each row execute procedure set_updated_at();

create index items_order_idx on items (order_id);
create index items_product_type_idx on items (product_type_id);

create table settings (
  key text primary key,
  value jsonb not null
);

create table login_attempts (
  id bigint generated always as identity primary key,
  ip text not null,
  success boolean not null default false,
  attempted_at timestamptz not null default now()
);
create index login_attempts_at_idx on login_attempts (attempted_at);
create index login_attempts_ip_idx on login_attempts (ip, attempted_at);

-- ---------------------------------------------------------------------------
-- Zámek dat: RLS deny-all + REVOKE. Aplikace přistupuje výhradně přes
-- connection string v env serverových funkcí (role postgres / owner, RLS
-- obchází). Anon/authenticated klíče Supabase jsou tím k ničemu i při úniku.
-- Na lokálním Postgresu role nemusí existovat — vytvoří se prázdné.
-- ---------------------------------------------------------------------------

do $$
begin
  if not exists (select from pg_roles where rolname = 'anon') then
    create role anon nologin;
  end if;
  if not exists (select from pg_roles where rolname = 'authenticated') then
    create role authenticated nologin;
  end if;
end $$;

alter table users enable row level security;
alter table clients enable row level security;
alter table orders enable row level security;
alter table order_events enable row level security;
alter table rooms enable row level security;
alter table product_types enable row level security;
alter table form_definitions enable row level security;
alter table items enable row level security;
alter table settings enable row level security;
alter table login_attempts enable row level security;

revoke all on all tables in schema public from anon, authenticated;
revoke all on all sequences in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
alter default privileges in schema public revoke all on sequences from anon, authenticated;
