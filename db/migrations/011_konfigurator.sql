-- Konfigurátor dodavatelů: podkategorie může místo verzované JSON definice
-- ukazovat do naměřených podkladů (podklady/data/*) klíčem `dodavatel:kod`.
-- Položka si klíč kopíruje (obdoba připnutí definice) — podklady se mění jen
-- s deployem repa, takže starší položky drží tvar, dokud se nepřeměří.

alter table subcategories
  add column if not exists konfig_key text;
create unique index if not exists subcategories_konfig_key_idx
  on subcategories (konfig_key) where konfig_key is not null;

alter table items
  add column if not exists konfig_key text;
