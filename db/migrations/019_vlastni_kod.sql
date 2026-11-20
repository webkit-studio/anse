-- Vlastní přihlašovací kód (S05, issue #7). Uživatel si v Nastavení může
-- nastavit vlastní kód: 8–64 znaků, ukládá se malými písmeny (přihlášení
-- velikost písmen nerozlišuje). Vygenerované kódy zůstávají 6 číslic.
--
-- Zpětně kompatibilní: typ se jen rozšiřuje (char(6) → text, unikátní index
-- zůstává) a kontrola povolí víc. Starý kód nad novým schématem běží beze
-- změny — zapisuje dál jen 6 číslic. Přihlášení na migraci nestojí.

alter table users alter column code type text;

alter table users drop constraint if exists users_code_check;
alter table users add constraint users_code_check check (
  code ~ '^[0-9]{6}$'
  or (char_length(code) between 8 and 64 and code = lower(code) and code !~ '\s')
);
