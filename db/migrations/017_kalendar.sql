-- Zaměření a montáže v kalendáři technika (S04, issue #5).
-- Každý uživatel si může vygenerovat osobní odkaz na odebíraný kalendář
-- (ICS feed). Odkaz nese náhodný token: kdo ho má, vidí termíny zakázek
-- přidělených tomu uživateli. Přegenerování token přepíše → starý odkaz
-- přestane fungovat.
--
-- Aditivní: nový nullable sloupec bez defaultu. Starý kód ho nečte ani
-- nezapisuje; přihlášení (/api/login, /api/me) na něm nestojí.
-- Token je plaintext stejně jako přihlašovací kódy: uživatel si odkaz musí
-- umět znovu zobrazit a zkopírovat do dalšího zařízení (decisions.md).

alter table users add column if not exists calendar_token text;

-- Unikátní kvůli vyhledání uživatele podle tokenu; víc NULL unikátnost nevadí.
create unique index if not exists users_calendar_token_key on users (calendar_token);
