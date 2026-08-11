-- Pět fází zakázky (zadání Lukáš, 5. 8. 2026):
--   rozpracovana → k_naceneni → k_objednavce → k_montazi → hotovo
-- Mapování starých stavů: „K objednání" = zaměřeno a čeká na kancelář →
-- k_naceneni; „Objednáno" = objednáno u výrobce, čeká montáž → k_montazi.

alter table orders drop constraint if exists orders_status_check;

update orders set status = 'k_naceneni' where status = 'k_objednani';
update orders set status = 'k_montazi' where status = 'objednano';

alter table orders
  add constraint orders_status_check
  check (status in ('rozpracovana', 'k_naceneni', 'k_objednavce', 'k_montazi', 'hotovo'));

-- Historie přechodů (statistiky čtou to_status) — přemapovat stejně.
update order_events set from_status = 'k_naceneni' where from_status = 'k_objednani';
update order_events set to_status = 'k_naceneni' where to_status = 'k_objednani';
update order_events set from_status = 'k_montazi' where from_status = 'objednano';
update order_events set to_status = 'k_montazi' where to_status = 'objednano';
