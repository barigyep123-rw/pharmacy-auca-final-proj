alter table drugs add column if not exists photo bytea;
alter table drugs add column if not exists photo_type text not null default '';
