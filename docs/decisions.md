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
| 9. 11. 2026 | S01–S04 bez samostatného návrhu D – drobné změny ve schváleném vzoru, kontrola snímky ráno | Lukáš schválil „pusť vše" |
