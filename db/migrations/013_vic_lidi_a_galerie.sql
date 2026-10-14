-- Zpětná vazba zadavatele:
--  - kontakt i zakázku jde přidělit víc lidem najednou (Kuba s Markem jdou
--    měřit spolu, notifikace přijde oběma; po zaměření jednoho odškrtnou)
--  - fotky od zákazníka jdou přidat už ke kontaktu, ještě před zakázkou;
--    galerie pak ukáže všechno pohromadě (od klienta, zaměření, realizace)

-- === přidělení víc lidem ===================================================
-- Pole uuid místo vazební tabulky: lidí je pár, filtr „moje" je `= any(...)`.
-- Existenci uživatelů hlídá server při zápisu.
alter table contacts add column if not exists assignee_ids uuid[] not null default '{}';
alter table orders add column if not exists assignee_ids uuid[] not null default '{}';

update contacts set assignee_ids = array[assigned_to] where assigned_to is not null;
update orders set assignee_ids = array[assignee_id] where assignee_id is not null;

create index if not exists contacts_assignees_idx on contacts using gin (assignee_ids);
create index if not exists orders_assignees_idx on orders using gin (assignee_ids);

-- Staré sloupce zůstávají jen kvůli plynulému nasazení (během buildu ještě
-- běží předchozí verze funkcí). Nový kód je nečte; smaže je další migrace.
comment on column contacts.assigned_to is 'ZASTARALÉ — nahrazeno assignee_ids (migrace 013)';
comment on column orders.assignee_id is 'ZASTARALÉ — nahrazeno assignee_ids (migrace 013)';

-- === fotky u kontaktu ======================================================
-- Fotka patří buď kontaktu (od zákazníka, před zakázkou), nebo zakázce.
alter table item_photos
  add column if not exists contact_id uuid references contacts (id) on delete cascade;
alter table item_photos alter column order_id drop not null;

alter table item_photos drop constraint if exists item_photos_owner_check;
alter table item_photos
  add constraint item_photos_owner_check check ((order_id is null) <> (contact_id is null));

alter table item_photos drop constraint if exists item_photos_kind_check;
alter table item_photos
  add constraint item_photos_kind_check
  check (kind in ('klient', 'zamereni', 'zavada', 'realizace'));

create index if not exists item_photos_contact_idx on item_photos (contact_id) where contact_id is not null;
