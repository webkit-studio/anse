-- Katalog produktů dostává druhou úroveň (produkt → podkategorie).
-- Výrobce a definice formuláře se stěhují z produktu na podkategorii:
-- „Okenní síť" je kategorie, „Jack West · SEL 15" je konkrétní editor dodavatele.
-- Migrace je jednorázový přepis existujících dat; na prázdné DB nedělá nic.

-- výrobce nově sedí na podkategorii
alter table product_types alter column manufacturer drop not null;
alter table product_types drop constraint if exists product_types_manufacturer_check;

alter table subcategories
  add column if not exists manufacturer text
    check (manufacturer in ('jackwest', 'neva', 'susy'));

-- === přejmenování produktů na nové kódy kategorií ==========================
update product_types set code = 'OKENNI-SIT',   name = 'Okenní síť'          where code = 'SEL-15';
update product_types set code = 'INT-ZALUZIE',  name = 'Interiérová žaluzie' where code = 'ESD';
update product_types set code = 'PLISSE',       name = 'Plissé'              where code = 'PLISSE';
update product_types set code = 'VENK-ZALUZIE', name = 'Venkovní žaluzie'    where code = 'VZ-TBD';
update product_types set code = 'VENK-ROLETA',  name = 'Venkovní roleta'     where code = 'VR-TBD';
update product_types set code = 'SCREEN',       name = 'Screen'              where code = 'VSC-TBD';

-- === z každého produktu s definicí vznikne jedna podkategorie ==============
insert into subcategories (product_type_id, code, name, manufacturer, active, sort, current_definition_id)
select pt.id, v.sub_code, v.sub_name, coalesce(pt.manufacturer, 'jackwest'), pt.active, 1,
       pt.current_definition_id
from product_types pt
join (values
  ('OKENNI-SIT',  'SEL-15',         'Jack West · SEL 15 — rám do okna'),
  ('INT-ZALUZIE', 'ESD',            'Jack West · ESD — horizontální 25 mm'),
  ('PLISSE',      'PLISSE-KLASIK',  'Jack West · Plissé klasik')
) as v (pt_code, sub_code, sub_name) on v.pt_code = pt.code
where pt.current_definition_id is not null
on conflict (product_type_id, code) do nothing;

-- definice se navážou na svou podkategorii
update form_definitions fd
set subcategory_id = s.id
from subcategories s
where s.product_type_id = fd.product_type_id
  and fd.subcategory_id is null;

-- položky dostanou podkategorii podle definice, se kterou byly vyplněné
update items i
set subcategory_id = fd.subcategory_id
from form_definitions fd
where fd.id = i.form_definition_id
  and i.subcategory_id is null;
