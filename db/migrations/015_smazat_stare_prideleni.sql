-- Úklid po migraci 013: přidělení drží `assignee_ids` (víc lidí), staré
-- jednosloupcové přidělení kód od 013 nečte ani nezapisuje (ověřeno grepem
-- v server/, netlify/, shared/, src/, scripts/, db/seeds/, e2e/ i .github/).
-- Indexy contacts_assigned_idx a orders_assignee_idx zmizí se sloupci.
-- Idempotentní — opakované spuštění nic neudělá.
alter table contacts drop column if exists assigned_to;
alter table orders drop column if exists assignee_id;
