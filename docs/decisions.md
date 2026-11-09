# Rozhodnutí

Datum · rozhodnutí · proč. Starší rozhodnutí žijí v `CLAUDE.md`
(architektonická pravidla a bezpečnostní trade-offy).

| Datum | Rozhodnutí | Proč |
|---|---|---|
| 9. 11. 2026 | Další vývoj jede štafetou: koordinátor + session po issues (`docs/pipeline.md`) | Lukáš. Čerstvé session jsou levnější a přesnější než jeden dlouhý chat |
| 9. 11. 2026 | Štafeta bez PR, merge rovnou do `main` až po branách | Platí „vše rovnou na produkci" z `CLAUDE.md`. Brány nahrazují review v PR |
| 9. 11. 2026 | Zadání session žije v GitHub issue, projekt v Dashboardu (`projects:anse`). Notion je jen archiv | Lukášův zdroj pravdy je Dashboard, štafeta potřebuje zadání u kódu |
| 9. 11. 2026 | Termín dodání po dodavatelích, měnitelný i po Objednáno, změna = notifikace přiděleným (S01) | SMS Dariny 2. 11. Kancelář objednává po dodavatelích |
| 9. 11. 2026 | Kancelář zadává položky ze zaměření, žádná dvojí role; při Objednáno se vybírá, kdo montuje (S02) | SMS Dariny 2. 11. Jednodušší než měnit model rolí |
| 9. 11. 2026 | Zakázka má typ Nová / Oprava, volí se ručně při založení (S03) | SMS Jakuba 20. 10. Při založení ještě nejsou položky |
| 9. 11. 2026 | Kalendář jako odebíraný ICS feed + tlačítko Přidat do kalendáře, ne Google API (S04) | Funguje v Google i iCloudu; Google obnovuje feed se zpožděním, proto i okamžité tlačítko |
| 9. 11. 2026 | Dodavatelé zakázky se neukládají, odvozují se z položek (podkategorie → výrobce, bez výrobce = „Ostatní"). `order_dodani` drží jen zadané termíny; `orders.term_dodani` = nejpozdější z nich, přepočítává server (S01) | Jeden zdroj pravdy; PDF, výpisy a staré záložky čtou dál jedno datum |
| 9. 11. 2026 | Termín dodání jde měnit jen ve fázích K nacenění a K montáži; notifikace `zmena_dodani` jen v K montáži a jen při skutečné změně data (S01) | Před Objednáno technik termín nepotřebuje; po montáži je změna bezpředmětná |
| 9. 11. 2026 | „Kdo montuje“ je stejné pole `assignee_ids` jako technik zakázky, ne nový sloupec; „Objednáno“ bez přiděleného blokuje server. Staré sloupce přidělení smazala migrace 015 (S02) | Jeden model přidělení; notifikace (`nova_zakazka`, `termin_dodani`) už na něm stojí |
| 9. 11. 2026 | Typ zakázky `orders.kind` (nova/oprava). Odznak „Oprava“ v info modré, nová odznak nemá. Typ mění kancelář i přidělený technik, u hotové a zrušené zakázky se nemění. Migrace 016 nastavila na opravu zakázky, kde jsou všechny položky opravy (S03) | Modrá se nebije s tóny fází; hotová má montážní list venku |
| 9. 11. 2026 | Kalendář: osobní token v adrese feedu (256 bitů, plaintext v `users.calendar_token`, přegenerování přepíše starý). Feed bez session, jen přidělené zakázky obou rolí, bez cen, bez zrušených, hotové 30 dní po dokončení. Zaměření s časem 1 h, bez času a montáž celodenní, časy s TZID Europe/Prague (S04) | Kalendáře cookie nepošlou. Token si uživatel musí umět znovu zobrazit, hash by nutil k přegenerování na každém zařízení |
| 9. 11. 2026 | Technik otevírá Kalendář ze Zprávy → ⚙ Nastavení (sheet přejmenovaný z „Nastavení notifikací"), kancelář kartou v Nastavení; stránka `/nastaveni/kalendar` je pro obě role (S04) | Technik vlastní Nastavení nemá; nová položka spodní navigace by byla změna navigace s návrhem D |
| 9. 11. 2026 | Rate-limit kalendáře v paměti instance a jen na RŮZNÉ neplatné tokeny per IP (30 / 10 min). Tabulka v DB ani sdílený limit s loginem ne (S04) | Zadání dovolilo levnější variantu; společné `login_attempts` by sken kalendáře zamkl přihlašování. Staré předplatné z IP Googlu nesmí blokovat platné kalendáře |
| 9. 11. 2026 | S01–S04 bez samostatného návrhu D – drobné změny ve schváleném vzoru, kontrola snímky ráno | Lukáš schválil „pusť vše" |
