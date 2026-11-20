-- Odvolání přihlášení (L01, issue #6). Session JWT nese verzi přihlášení
-- uživatele; server ji u každého requestu porovná s tímto sloupcem (přes cache
-- uživatelů, nejvýš 60 s). Reset nebo změna kódu a deaktivace verzi zvýší →
-- všechna dřív vydaná přihlášení toho uživatele přestanou platit na všech
-- zařízeních.
--
-- Aditivní: not null s defaultem 0. Tokeny vydané před L01 verzi nenesou
-- a platí jako 0 → nasazení nikoho neodhlásí. Přihlášení (/api/login, /api/me)
-- chybějící sloupec přežije (bere verzi 0), na pořadí buildu a migrace nezáleží.

alter table users add column if not exists session_version integer not null default 0;
