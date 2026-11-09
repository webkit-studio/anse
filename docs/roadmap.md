# Roadmapa

Aplikace je v produkci (<https://anse-zakazky.netlify.app>). Další práce
jde štafetou (`docs/pipeline.md`), koordinuje ji chat podle
`docs/koordinator.md`.

## Stav
_Aktualizováno: 9. 11. 2026 · založení štafety_

**Hotovo:** kontakty s přidělením víc lidem, zakázky v pěti fázích,
formuláře podle výrobce, konfigurátor (Jack West, SUYS, Neva), návody,
galerie fotek, podpis a montážní list PDF, XML a CSV export pro Jack West,
notifikace in-app a e-mail, lišta „Je tu nová verze". Podrobně `README.md`.
**Rozpracováno:** nic.
**Další krok:** Lukáš zadá koordinátorovi úkoly, koordinátor z nich udělá issues.
**Blokery:** žádné.

### Na Lukášovi
| Co | Proč | Od kdy |
|---|---|---|
| Zadat první úkoly koordinátorovi | Štafeta nemá plán | 9. 11. 2026 |

## Dluh, který stojí za session
- Smazat zastaralé sloupce `contacts.assigned_to` a `orders.assignee_id`
  (migrace 013 je nahradila, kód je nečte) – migrace 014 nebo později.
