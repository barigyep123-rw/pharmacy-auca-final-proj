alter table prescriptions add column if not exists facility text not null default '';
alter table prescriptions add column if not exists prescription_number text not null default '';
alter table prescriptions add column if not exists photo bytea;
alter table prescriptions add column if not exists photo_type text not null default '';
