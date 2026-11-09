-- Typ zakázky Nová / Oprava (S03, issue #4).
-- Rozlišení existovalo jen u položky (items.kind); zakázka jako celek typ
-- neměla, takže v seznamech a na Dnes nebylo vidět, že se jede opravovat.
--
-- Aditivní: nový sloupec s defaultem. Starý kód do něj nic nezapisuje a nové
-- zakázky z něj dostanou 'nova' — běží dál beze změny.

alter table orders add column if not exists kind text not null default 'nova';

do $$
begin
  alter table orders add constraint orders_kind_check check (kind in ('nova', 'oprava'));
exception
  when duplicate_object then null;
end $$;

-- Stávající zakázky, kde jsou VŠECHNY položky opravy, jsou opravy. Zakázka bez
-- položek nebo se smíšenými položkami zůstává nová (nedá se poznat, co je).
--
-- Trigger orders_updated_at se na dobu doplnění vypne: doplnění typu není
-- úprava zakázky. Jinak by se posunul čas „Změněno", ranní hlídka by zakázky
-- přestala hlásit jako stojící a otevřené záložky by při uložení dostaly 409.
-- Migrace běží v transakci, takže se trigger zapne i při chybě (rollback).
alter table orders disable trigger orders_updated_at;

update orders o
set kind = 'oprava'
where o.kind = 'nova'
  and exists (select 1 from items i where i.order_id = o.id)
  and not exists (select 1 from items i where i.order_id = o.id and i.kind <> 'oprava');

alter table orders enable trigger orders_updated_at;
