-- 002: zpětná vazba z testování M1 (16. 7. večer)

-- ---------------------------------------------------------------------------
-- Zjednodušení stavů: jen Rozpracovaná → K objednání → Objednáno (jen vpřed).
-- K vyměření a Namontováno se ruší; stávající zakázky se přemapují.
-- order_events zůstávají (historie smí nést i staré stavy).
-- ---------------------------------------------------------------------------

update orders set status = 'rozpracovana' where status = 'k_vymereni';
update orders set status = 'objednano' where status = 'namontovano';

alter table orders drop constraint orders_status_check;
alter table orders add constraint orders_status_check
  check (status in ('rozpracovana', 'k_objednani', 'objednano'));

-- ---------------------------------------------------------------------------
-- Optimistický zámek: milisekundová přesnost updated_at.
-- JS Date má jen ms — postgres.js parsoval ISO string tokenu přes Date,
-- mikrosekundy se ztratily a compare-and-swap NIKDY nesedl (409 na každé
-- editaci položky/hlavičky). timestamptz(3) srovná přesnost všech vrstev.
-- ---------------------------------------------------------------------------

alter table clients alter column updated_at type timestamptz(3);
alter table orders alter column updated_at type timestamptz(3);
alter table items alter column updated_at type timestamptz(3);
