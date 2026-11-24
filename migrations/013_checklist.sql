-- Categories, generic/strength/brand, lots, baskets, claims, till, stocktake, patient detail.

create table if not exists categories (
  id integer generated always as identity primary key,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now()
);
create unique index if not exists categories_name_idx on categories (lower(name));

create table if not exists subcategories (
  id integer generated always as identity primary key,
  category_id integer not null references categories (id) on delete cascade,
  name text not null,
  description text not null default '',
  created_at timestamptz not null default now(),
  unique (category_id, name)
);

create table if not exists generics (
  id integer generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now()
);
create unique index if not exists generics_name_idx on generics (lower(name));

create table if not exists variants (
  id integer generated always as identity primary key,
  generic_id integer not null references generics (id) on delete cascade,
  strength text not null default '',
  form text not null default 'tablet',
  unique (generic_id, strength, form)
);

alter table drugs add column if not exists category_id integer references categories (id);
alter table drugs add column if not exists subcategory_id integer references subcategories (id);
alter table drugs add column if not exists generic_id integer references generics (id);
alter table drugs add column if not exists variant_id integer references variants (id);
alter table drugs add column if not exists brand_name text not null default '';
alter table drugs add column if not exists manufacturer text not null default '';
alter table drugs add column if not exists barcode text not null default '';
alter table drugs add column if not exists rx_only boolean not null default false;
alter table drugs add column if not exists strip_size integer not null default 10;
alter table drugs add column if not exists strip_price integer not null default 0;
alter table drugs add column if not exists pack_price integer not null default 0;

alter table drugs drop constraint if exists drugs_strip_size_check;
alter table drugs add constraint drugs_strip_size_check check (strip_size >= 1);

create table if not exists drug_batches (
  id integer generated always as identity primary key,
  drug_id integer not null references drugs (id) on delete cascade,
  lot_number text not null default '',
  expiry_date date not null,
  quantity integer not null check (quantity >= 0),
  created_at timestamptz not null default now()
);

insert into drug_batches (drug_id, lot_number, expiry_date, quantity)
select d.id, d.batch_number, d.expiry_date::date, d.quantity
from drugs d
where d.quantity > 0
  and d.expiry_date ~ '^\d{4}-\d{2}-\d{2}$'
  and not exists (select 1 from drug_batches b where b.drug_id = d.id);

insert into categories (name)
select distinct btrim(category) from drugs
where btrim(category) <> ''
  and not exists (select 1 from categories c where lower(c.name) = lower(btrim(drugs.category)));

update drugs d set category_id = c.id
from categories c
where d.category_id is null and lower(c.name) = lower(btrim(d.category));

insert into generics (name)
select distinct btrim(generic_name) from drugs
where btrim(generic_name) <> ''
  and not exists (select 1 from generics g where lower(g.name) = lower(btrim(drugs.generic_name)));

insert into variants (generic_id, strength, form)
select distinct g.id, d.strength, d.form
from drugs d
join generics g on lower(g.name) = lower(btrim(d.generic_name))
where not exists (
  select 1 from variants v
  where v.generic_id = g.id and v.strength = d.strength and v.form = d.form
);

update drugs d set
  generic_id = g.id,
  variant_id = v.id,
  brand_name = case when d.brand_name = '' then d.name else d.brand_name end,
  manufacturer = case when d.manufacturer = '' then d.supplier else d.manufacturer end
from generics g
join variants v on v.generic_id = g.id
where lower(g.name) = lower(btrim(d.generic_name))
  and v.strength = d.strength
  and v.form = d.form
  and d.variant_id is null;

update drugs set rx_only = true where category = 'Antibiotic' and rx_only = false;

create table if not exists therapy_pairs (
  id integer generated always as identity primary key,
  left_name text not null,
  right_name text not null,
  note text not null
);

insert into therapy_pairs (left_name, right_name, note)
select 'Ibuprofen', 'Diclofenac', 'Both are NSAIDs. Do not give them together.'
where not exists (
  select 1 from therapy_pairs
  where lower(left_name) = 'ibuprofen' and lower(right_name) = 'diclofenac'
);

create table if not exists baskets (
  id integer generated always as identity primary key,
  receipt_number text not null default '',
  customer_name text not null default '',
  patient_id integer references patients (id),
  payment_method_id integer references payment_methods (id),
  sold_by integer not null references users (id),
  status text not null default 'completed' check (status in ('pending_check', 'completed', 'void')),
  checked_by integer references users (id),
  checked_at timestamptz,
  fiscal_code text not null default '',
  created_at timestamptz not null default now()
);

create table if not exists basket_lines (
  id integer generated always as identity primary key,
  basket_id integer not null references baskets (id) on delete cascade,
  drug_id integer not null references drugs (id),
  sold_as text not null default 'base' check (sold_as in ('base', 'strip', 'pack')),
  count integer not null check (count > 0),
  base_quantity integer not null check (base_quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  total integer not null check (total >= 0),
  directions text not null default '',
  dose text not null default '',
  route text not null default '',
  frequency text not null default '',
  duration text not null default ''
);

alter table sales add column if not exists basket_id integer references baskets (id);
alter table sales add column if not exists directions text not null default '';
alter table sales add column if not exists dose text not null default '';
alter table sales add column if not exists route text not null default '';
alter table sales add column if not exists frequency text not null default '';
alter table sales add column if not exists duration text not null default '';
alter table sales add column if not exists fiscal_code text not null default '';
alter table sales add column if not exists lot_label text not null default '';

alter table sales drop constraint if exists sales_sold_as_check;
alter table sales add constraint sales_sold_as_check check (sold_as in ('base', 'strip', 'pack'));

create table if not exists sale_allocations (
  id integer generated always as identity primary key,
  sale_id integer not null references sales (id) on delete cascade,
  batch_id integer not null references drug_batches (id),
  quantity integer not null check (quantity > 0)
);

create table if not exists stock_adjustments (
  id integer generated always as identity primary key,
  drug_id integer not null references drugs (id),
  batch_id integer references drug_batches (id),
  kind text not null check (kind in ('return_restock', 'return_dispose', 'damaged', 'expired')),
  quantity integer not null check (quantity > 0),
  reason text not null,
  sale_id integer references sales (id),
  created_by integer not null references users (id),
  created_at timestamptz not null default now()
);

create table if not exists insurers (
  id integer generated always as identity primary key,
  name text not null,
  kind text not null check (kind in ('rssb', 'mmi', 'mutuelle', 'private'))
);
create unique index if not exists insurers_name_idx on insurers (lower(name));

insert into insurers (name, kind)
select name, kind from (values
  ('RSSB', 'rssb'),
  ('MMI', 'mmi'),
  ('Mutuelle', 'mutuelle')
) as seed(name, kind)
where not exists (select 1 from insurers i where lower(i.name) = lower(seed.name));

create table if not exists claims (
  id integer generated always as identity primary key,
  insurer_id integer not null references insurers (id),
  patient_id integer references patients (id),
  sale_id integer references sales (id),
  member_number text not null default '',
  patient_paid integer not null check (patient_paid >= 0),
  insurer_amount integer not null check (insurer_amount >= 0),
  status text not null default 'draft' check (status in ('draft', 'sent', 'part', 'paid', 'late')),
  notes text not null default '',
  created_by integer not null references users (id),
  created_at timestamptz not null default now()
);

create table if not exists till_shifts (
  id integer generated always as identity primary key,
  opened_by integer not null references users (id),
  closed_by integer references users (id),
  opened_at timestamptz not null default now(),
  closed_at timestamptz,
  expected_cash integer,
  counted_cash integer,
  note text not null default ''
);

create table if not exists stocktakes (
  id integer generated always as identity primary key,
  status text not null default 'open' check (status in ('open', 'posted')),
  note text not null default '',
  created_by integer not null references users (id),
  posted_by integer references users (id),
  created_at timestamptz not null default now(),
  posted_at timestamptz
);

create table if not exists stocktake_lines (
  id integer generated always as identity primary key,
  stocktake_id integer not null references stocktakes (id) on delete cascade,
  drug_id integer not null references drugs (id),
  expected_qty integer not null,
  counted_qty integer not null check (counted_qty >= 0),
  unique (stocktake_id, drug_id)
);

create table if not exists ready_notes (
  id integer generated always as identity primary key,
  patient_id integer references patients (id),
  phone text not null default '',
  body text not null,
  created_by integer not null references users (id),
  created_at timestamptz not null default now()
);

alter table patients add column if not exists sex text not null default '';
alter table patients add column if not exists date_of_birth text not null default '';
alter table patients add column if not exists insurer_name text not null default '';
alter table patients add column if not exists member_number text not null default '';
alter table patients add column if not exists allergies text not null default '';
alter table patients add column if not exists brand_preference text not null default '';
alter table patients add column if not exists preferred_brand text not null default '';

alter table patients drop constraint if exists patients_sex_check;
alter table patients add constraint patients_sex_check check (sex in ('', 'female', 'male'));
alter table patients drop constraint if exists patients_brand_preference_check;
alter table patients add constraint patients_brand_preference_check check (brand_preference in ('', 'any', 'generic_only', 'brand'));

alter table prescriptions add column if not exists days_supply integer not null default 0;
alter table prescriptions add column if not exists dispense_as_written boolean not null default false;
alter table prescriptions drop constraint if exists prescriptions_days_supply_check;
alter table prescriptions add constraint prescriptions_days_supply_check check (days_supply >= 0 and days_supply <= 365);

alter table business_profile add column if not exists tin text not null default '';
alter table business_profile add column if not exists ebm_serial text not null default '';

alter table audit_log add column if not exists detail text not null default '';

do $$
declare
  constraint_name text;
begin
  select con.conname into constraint_name
  from pg_constraint con
  join pg_class rel on rel.oid = con.conrelid
  where rel.relname = 'users' and con.contype = 'c' and pg_get_constraintdef(con.oid) like '%role%';
  if constraint_name is not null then
    execute format('alter table users drop constraint %I', constraint_name);
  end if;
end $$;

alter table users add constraint users_role_check
  check (role in ('admin', 'pharmacist', 'stock_keeper', 'cashier', 'dispenser'));
