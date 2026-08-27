-- Přestavba dle zadání ANSE (27. 8. 2026): kontakty jako vstupní bod, pět fází
-- zakázky, přiřazení technika, oddělení ceny zákazníka od ceny práce technika,
-- fotky, podpisy jako vlastní tabulka, podkategorie produktů a notifikace.
--
-- Mapování starých stavů na nové fáze:
--   rozpracovana → k_zamereni      (technik zaměřuje)
--   k_naceneni   → k_naceneni      (beze změny významu)
--   k_objednavce → k_naceneni      (kancelář ještě nedala Objednáno)
--   k_montazi    → k_montazi
--   hotovo       → hotovo

-- === uživatelé: kontakt a role kancelář ===================================
alter table users
  add column if not exists phone text not null default '',
  add column if not exists email text not null default '';

alter table users drop constraint if exists users_role_check;
update users set role = 'kancelar' where role = 'admin';
alter table users add constraint users_role_check check (role in ('technik', 'kancelar'));

-- === kontakty =============================================================
create table if not exists contacts (
  id uuid primary key default gen_random_uuid(),
  name text not null default '',
  phone text not null default '',
  place text not null default '',
  fresh boolean not null default true,
  cancelled boolean not null default false,
  cancelled_reason text not null default '',
  created_by uuid not null references users (id),
  created_at timestamptz not null default now(),
  updated_at timestamptz(3) not null default now(),
  -- jméno NEBO telefon musí být vyplněné (stihne se během telefonátu)
  constraint contacts_identity check (name <> '' or phone <> '')
);

create index if not exists contacts_fresh_idx on contacts (fresh, created_at desc);
create index if not exists contacts_search_idx on contacts (unaccent_cz(name));

drop trigger if exists contacts_updated_at on contacts;
create trigger contacts_updated_at before update on contacts
  for each row execute function set_updated_at();

create table if not exists contact_notes (
  id bigserial primary key,
  contact_id uuid not null references contacts (id) on delete cascade,
  author_id uuid not null references users (id),
  text text not null,
  created_at timestamptz not null default now()
);
create index if not exists contact_notes_contact_idx on contact_notes (contact_id, created_at desc);

-- === zakázky: fáze, kontakt, technik, ceny =================================
alter table orders
  add column if not exists contact_id uuid references contacts (id),
  add column if not exists assignee_id uuid references users (id),
  add column if not exists phase text,
  add column if not exists addr_fakt text not null default '',
  add column if not exists price_customer text not null default '',
  add column if not exists price_montage text not null default '',
  add column if not exists term_dodani date,
  add column if not exists term_montaz date,
  add column if not exists cancelled_reason text not null default '';

-- převod stavů na fáze
update orders set phase = case status
    when 'rozpracovana' then 'k_zamereni'
    when 'k_naceneni'   then 'k_naceneni'
    when 'k_objednavce' then 'k_naceneni'
    when 'k_montazi'    then 'k_montazi'
    when 'hotovo'       then 'hotovo'
    else 'k_zamereni'
  end
where phase is null;

-- termíny a ceny ze starých sloupců (delivery_date = termín dodání)
update orders set term_dodani = delivery_date where term_dodani is null and delivery_date is not null;
update orders set price_customer = price_total where price_customer = '' and price_total <> '';

-- technik = zakladatel zakázky, dokud se nepřiřadí jinak
update orders set assignee_id = created_by where assignee_id is null;

-- === kontakt ke každé stávající zakázce ====================================
-- Zakázka vždy patří kontaktu; pro historická data se kontakt dogeneruje
-- z karty klienta (jeden kontakt na klienta).
insert into contacts (name, phone, place, fresh, created_by, created_at)
select distinct on (c.id)
       c.name, c.phone, c.address, false, o.created_by, c.created_at
from clients c
join orders o on o.client_id = c.id
where not exists (select 1 from contacts ct where ct.name = c.name and ct.phone = c.phone);

update orders o
set contact_id = ct.id
from clients c
join contacts ct on ct.name = c.name and ct.phone = c.phone
where o.client_id = c.id and o.contact_id is null;

-- zakázky bez dohledatelného kontaktu (prázdná karta) dostanou náhradní
insert into contacts (name, phone, place, fresh, created_by)
select 'Neznámý kontakt', '', o.installation_address, false, o.created_by
from orders o where o.contact_id is null
limit 1;

update orders set contact_id = (select id from contacts where name = 'Neznámý kontakt' limit 1)
where contact_id is null;

alter table orders alter column phase set not null;
alter table orders alter column contact_id set not null;
alter table orders drop constraint if exists orders_phase_check;
alter table orders add constraint orders_phase_check
  check (phase in ('k_zamereni', 'k_naceneni', 'k_montazi', 'k_fakturaci', 'hotovo', 'zruseno'));

create index if not exists orders_phase_idx on orders (phase, updated_at desc);
create index if not exists orders_assignee_idx on orders (assignee_id, phase);
create index if not exists orders_contact_idx on orders (contact_id, created_at desc);

-- === položky: zaměření vs. oprava, podkategorie ============================
alter table items
  add column if not exists kind text not null default 'config',
  add column if not exists subcategory_id uuid,
  add column if not exists defect_note text not null default '';

alter table items drop constraint if exists items_kind_check;
alter table items add constraint items_kind_check check (kind in ('config', 'oprava'));

-- oprava nemá definici formuláře → uvolnit povinnost
alter table items alter column form_definition_id drop not null;

-- === fotky položek =========================================================
create table if not exists item_photos (
  id uuid primary key default gen_random_uuid(),
  item_id uuid references items (id) on delete cascade,
  order_id uuid not null references orders (id) on delete cascade,
  kind text not null check (kind in ('zamereni', 'zavada', 'realizace')),
  data text not null,                       -- data-URL (komprimováno na klientu)
  created_by uuid not null references users (id),
  created_at timestamptz not null default now()
);
create index if not exists item_photos_item_idx on item_photos (item_id);
create index if not exists item_photos_order_idx on item_photos (order_id, kind);

-- === podpisy jako vlastní tabulka ==========================================
create table if not exists signatures (
  id uuid primary key default gen_random_uuid(),
  order_id uuid not null references orders (id) on delete cascade,
  data text not null,                       -- PNG data-URL
  signer_name text not null default '',
  signed_by uuid not null references users (id),
  signed_at timestamptz(3) not null default now()
);
create unique index if not exists signatures_order_idx on signatures (order_id);

-- přenos podpisů ze sloupců orders
insert into signatures (order_id, data, signed_by, signed_at)
select o.id, o.signature_png, coalesce(o.signed_by, o.created_by), coalesce(o.signed_at, now())
from orders o
where o.signature_png is not null
  and not exists (select 1 from signatures s where s.order_id = o.id);

-- === podkategorie produktů =================================================
alter table product_types
  add column if not exists custom_name text not null default '',
  add column if not exists note_for_tech text not null default '';

create table if not exists subcategories (
  id uuid primary key default gen_random_uuid(),
  product_type_id uuid not null references product_types (id) on delete cascade,
  code text not null,
  name text not null,
  custom_name text not null default '',
  note text not null default '',
  active boolean not null default true,
  sort integer not null default 0,
  current_definition_id uuid references form_definitions (id),
  unique (product_type_id, code)
);
create index if not exists subcategories_type_idx on subcategories (product_type_id, sort);

alter table form_definitions add column if not exists subcategory_id uuid references subcategories (id);

-- === notifikace ============================================================
create table if not exists notifications (
  id bigserial primary key,
  user_id uuid not null references users (id) on delete cascade,
  event text not null,
  title text not null,
  body text not null,
  order_id uuid references orders (id) on delete cascade,
  contact_id uuid references contacts (id) on delete cascade,
  read boolean not null default false,
  created_at timestamptz not null default now()
);
create index if not exists notifications_user_idx on notifications (user_id, read, created_at desc);

create table if not exists notif_prefs (
  user_id uuid not null references users (id) on delete cascade,
  event text not null,
  email boolean not null default true,
  primary key (user_id, event)
);

-- === REVOKE na nových tabulkách (RLS deny-all jako u zbytku) ===============
do $$
declare t text;
begin
  foreach t in array array['contacts','contact_notes','item_photos','signatures','subcategories','notifications','notif_prefs']
  loop
    execute format('alter table %I enable row level security', t);
    execute format('revoke all on table %I from anon, authenticated', t);
  end loop;
end $$;
