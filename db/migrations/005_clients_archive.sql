-- Archivace zákazníků (zadání Lukáš, 4. 8. 2026): koš ve výběru „Stávající"
-- zákazníka jen skryje ze seznamu (archived_at). Zakázky drží FK dál a jejich
-- historie zůstává kompletní — tvrdé mazání klientů neexistuje.

alter table clients
  add column if not exists archived_at timestamptz;
