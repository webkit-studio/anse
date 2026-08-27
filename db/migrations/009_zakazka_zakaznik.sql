-- Údaje zákazníka se stěhují z tabulky clients přímo na zakázku: technik je
-- vyplňuje u první položky a patří ke konkrétní zakázce (SVJ i stavební firmy
-- mívají u každé zakázky jinou fakturační adresu). Kontakt zůstává databází
-- čísel, zakázka nese vlastní hlavičku.

alter table orders
  add column if not exists customer_name text not null default '',
  add column if not exists customer_phone text not null default '',
  add column if not exists customer_email text not null default '',
  add column if not exists addr_montaz text not null default '',
  add column if not exists ico text not null default '',
  add column if not exists dic text not null default '',
  add column if not exists invoice_no text not null default '',
  add column if not exists order_no text not null default '';

-- backfill ze staré struktury (běží jen když tam ty sloupce ještě jsou)
do $$
begin
  if exists (select 1 from information_schema.columns
             where table_name = 'orders' and column_name = 'client_id') then
    update orders o set
      customer_name  = coalesce(nullif(o.customer_name, ''), c.name),
      customer_phone = coalesce(nullif(o.customer_phone, ''), c.phone),
      customer_email = coalesce(nullif(o.customer_email, ''), c.email),
      addr_montaz    = coalesce(nullif(o.addr_montaz, ''), nullif(o.installation_address, ''),
                                nullif(c.delivery_address, ''), c.address),
      addr_fakt      = coalesce(nullif(o.addr_fakt, ''), c.address),
      ico            = coalesce(nullif(o.ico, ''), c.ico),
      dic            = coalesce(nullif(o.dic, ''), c.dic),
      invoice_no     = coalesce(nullif(o.invoice_no, ''), o.invoice_number),
      order_no       = coalesce(nullif(o.order_no, ''), o.order_number)
    from clients c where c.id = o.client_id;
  end if;
end $$;

-- === historie přechodů: stavy → fáze =======================================
alter table order_events rename column from_status to from_phase;
alter table order_events rename column to_status to to_phase;
create index if not exists order_events_created_idx on order_events (created_at desc);

-- === úklid legacy sloupců ==================================================
alter table orders drop constraint if exists orders_status_check;
alter table orders drop constraint if exists orders_client_id_fkey;
alter table orders
  drop column if exists status,
  drop column if exists client_id,
  drop column if exists installation_address,
  drop column if exists montage_number,
  drop column if exists order_number,
  drop column if exists invoice_number,
  drop column if exists delivery_date,
  drop column if exists price_ex_vat,
  drop column if exists price_vat,
  drop column if exists price_total,
  drop column if exists price_deposit,
  drop column if exists price_balance,
  drop column if exists montage_by,
  drop column if exists signature_png,
  drop column if exists signed_at,
  drop column if exists signed_by;

drop index if exists orders_status_idx;
drop index if exists orders_client_idx;
drop table if exists clients;
