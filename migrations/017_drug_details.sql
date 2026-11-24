alter table drugs add column if not exists description text not null default '';
alter table drugs add column if not exists origin_country text not null default '';
alter table drugs add column if not exists strength_value text not null default '';
alter table drugs add column if not exists strength_unit text not null default '';
alter table drugs add column if not exists rssb_cover integer;
alter table drugs add column if not exists mutuelle_cover integer;

create table if not exists catalog_units (
  id integer generated always as identity primary key,
  kind text not null check (kind in ('base', 'pack')),
  name text not null,
  active boolean not null default true
);

create unique index if not exists catalog_units_kind_name_idx on catalog_units (kind, lower(name));

insert into catalog_units (kind, name)
select 'base', name
from (values ('tablet'), ('capsule'), ('sachet'), ('bottle'), ('tube'), ('inhaler'), ('vial'), ('ampoule'), ('ml')) as seed(name)
where not exists (select 1 from catalog_units u where u.kind = 'base' and lower(u.name) = lower(seed.name));

insert into catalog_units (kind, name)
select 'pack', name
from (values ('box'), ('blister'), ('strip'), ('carton'), ('pack'), ('bottle')) as seed(name)
where not exists (select 1 from catalog_units u where u.kind = 'pack' and lower(u.name) = lower(seed.name));
