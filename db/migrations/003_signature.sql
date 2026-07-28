-- Digitální podpis zákazníka u zakázky (zadání Marek, 28. 7. 2026).
-- PNG data-URL se drží mimo běžné dotazy (detail vrací jen signed_at) a čte se
-- až při PDF exportu montážního listu. Přepodepsání je povolené (poslední platí).

alter table orders
  add column if not exists signature_png text,
  add column if not exists signed_at timestamptz(3),
  add column if not exists signed_by uuid references users(id);
