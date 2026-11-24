create table if not exists drug_photos (
  id integer generated always as identity primary key,
  drug_id integer not null references drugs (id) on delete cascade,
  photo bytea not null,
  photo_type text not null default 'image/jpeg',
  created_at timestamptz not null default now()
);

create index if not exists drug_photos_drug_idx on drug_photos (drug_id, id);

insert into drug_photos (drug_id, photo, photo_type)
select d.id, d.photo, coalesce(nullif(d.photo_type, ''), 'image/jpeg')
from drugs d
where d.photo is not null
  and not exists (select 1 from drug_photos p where p.drug_id = d.id);
