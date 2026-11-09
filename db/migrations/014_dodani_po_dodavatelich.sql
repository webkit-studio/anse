-- Termín dodání zvlášť pro každého dodavatele zakázky (S01, issue #2).
-- Dva výrobky od dvou dodavatelů dorazí každý jindy; jedno pole nestačilo.
--
-- Aditivní: nová tabulka, nic se nemaže. `orders.term_dodani` zůstává a server
-- ho drží jako NEJPOZDĚJŠÍ z termínů dodavatelů (PDF, výpisy, notifikace
-- a záložky se starým kódem čtou dál jedno datum).
--
-- `dodavatel` = subcategories.manufacturer (jackwest, suys, neva); prázdný
-- řetězec = „Ostatní" (opravy a položky bez podkategorie). Seznam dodavatelů
-- se neukládá — odvozuje se z položek; řádek tu je, jen když je zadaný termín.

create table if not exists order_dodani (
  order_id uuid not null references orders (id) on delete cascade,
  dodavatel text not null default '',
  term date not null,
  updated_at timestamptz not null default now(),
  primary key (order_id, dodavatel)
);

alter table order_dodani enable row level security;
revoke all on order_dodani from anon, authenticated;

-- Zakázky, které už termín mají: převezme ho každý jejich dodavatel, ať se
-- po nasazení neobjeví jako „chybí" ve fázi K montáži.
insert into order_dodani (order_id, dodavatel, term)
select distinct o.id, coalesce(s.manufacturer, ''), o.term_dodani
from orders o
join items i on i.order_id = o.id
left join subcategories s on s.id = i.subcategory_id
where o.term_dodani is not null
on conflict (order_id, dodavatel) do nothing;
