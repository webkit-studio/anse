-- Údaje pro PDF export montážního listu (zadání Lukáš, 4. 8. 2026):
-- částky a jméno montéra se nově evidují v aplikaci a tisknou do PDF.
-- Volný text (ne numeric) — na papíře se píší i s měnou/poznámkou, bez počítání.

alter table orders
  add column if not exists price_ex_vat text not null default '',
  add column if not exists price_vat text not null default '',
  add column if not exists price_montage text not null default '',
  add column if not exists price_total text not null default '',
  add column if not exists price_deposit text not null default '',
  add column if not exists price_balance text not null default '',
  add column if not exists montage_by text not null default '';
