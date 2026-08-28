-- Zpětná vazba z 1. kola provozu:
--  - kontakty se PŘIDĚLUJÍ (ať je jasné, kdo se má ozvat — Jakub nevolá na vše)
--  - fakturační adresa je příznak „stejná jako montážní", ne kopie textu
--  - termín zaměření může nést i čas (technik si plánuje den)

alter table contacts
  add column if not exists assigned_to uuid references users (id);
create index if not exists contacts_assigned_idx on contacts (assigned_to) where fresh;

alter table orders
  add column if not exists addr_fakt_same boolean not null default true,
  add column if not exists measured_time time;

-- existující zakázky: příznak odvodit z toho, co v adrese reálně je
update orders set addr_fakt_same = (addr_fakt = '' or addr_fakt = addr_montaz);
