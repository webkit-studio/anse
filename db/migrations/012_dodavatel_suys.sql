-- Značka dodavatele SUYS byla od migrace 001 zapsaná s překlepem („susy“)
-- a ten se dostal i do CHECK omezení, takže se chyba nedala opravit jen v datech.
-- Tahle migrace ho srovná: nejdřív uvolní omezení, přepíše řádky, pak zavede
-- správný seznam včetně Nevy (třetí dodavatel).

alter table subcategories drop constraint if exists subcategories_manufacturer_check;
alter table product_types drop constraint if exists product_types_manufacturer_check;

update subcategories set manufacturer = 'suys' where manufacturer = 'susy';
update product_types set manufacturer = 'suys' where manufacturer = 'susy';

alter table subcategories
  add constraint subcategories_manufacturer_check
  check (manufacturer in ('jackwest', 'suys', 'neva'));

alter table product_types
  add constraint product_types_manufacturer_check
  check (manufacturer in ('jackwest', 'suys', 'neva'));
