create table if not exists patients (
  id integer generated always as identity primary key,
  name text not null,
  phone text not null default '',
  notes text not null default '',
  created_at timestamptz not null default now()
);

create unique index if not exists patients_identity_idx on patients (lower(name), lower(phone));

alter table prescriptions add column if not exists patient_id integer references patients (id);
alter table prescriptions add column if not exists refills_allowed integer not null default 0;

alter table prescriptions drop constraint if exists prescriptions_refills_allowed_check;
alter table prescriptions add constraint prescriptions_refills_allowed_check
  check (refills_allowed >= 0 and refills_allowed <= 12);

create table if not exists prescription_fills (
  id integer generated always as identity primary key,
  prescription_id integer not null references prescriptions (id) on delete cascade,
  fill_number integer not null check (fill_number >= 1),
  dispensed_by integer not null references users (id),
  created_at timestamptz not null default now(),
  unique (prescription_id, fill_number)
);

alter table sales add column if not exists fill_id integer references prescription_fills (id);
alter table sales add column if not exists patient_id integer references patients (id);

alter table suppliers add column if not exists phone text not null default '';
alter table suppliers add column if not exists email text not null default '';
alter table suppliers add column if not exists contact_name text not null default '';
alter table suppliers add column if not exists address text not null default '';
alter table suppliers add column if not exists terms text not null default '';
alter table suppliers add column if not exists notes text not null default '';
alter table suppliers add column if not exists active boolean not null default true;

alter table supplier_invoices add column if not exists supplier_id integer references suppliers (id);
alter table purchase_orders add column if not exists supplier_id integer references suppliers (id);

create table if not exists audit_log (
  id integer generated always as identity primary key,
  actor_id integer references users (id) on delete set null,
  actor_name text not null default '',
  action text not null,
  entity text not null,
  entity_id integer,
  summary text not null,
  created_at timestamptz not null default now()
);

create index if not exists audit_log_created_idx on audit_log (created_at desc);

insert into patients (name, phone)
select distinct on (lower(btrim(patient_name)), lower(btrim(patient_phone)))
  btrim(patient_name), btrim(patient_phone)
from prescriptions
where btrim(patient_name) <> ''
  and not exists (
    select 1 from patients s
    where lower(s.name) = lower(btrim(prescriptions.patient_name))
      and lower(s.phone) = lower(btrim(prescriptions.patient_phone))
  )
order by lower(btrim(patient_name)), lower(btrim(patient_phone)), id;

update prescriptions p
set patient_id = s.id
from patients s
where p.patient_id is null
  and lower(btrim(p.patient_name)) = lower(s.name)
  and lower(btrim(p.patient_phone)) = lower(s.phone);

insert into prescription_fills (prescription_id, fill_number, dispensed_by, created_at)
select p.id, 1, coalesce(p.dispensed_by, p.created_by), coalesce(p.dispensed_at, p.created_at)
from prescriptions p
where p.status = 'dispensed'
  and not exists (select 1 from prescription_fills f where f.prescription_id = p.id);

update sales s
set fill_id = f.id
from prescription_fills f
where s.prescription_id = f.prescription_id
  and f.fill_number = 1
  and s.fill_id is null;

update sales s
set patient_id = p.patient_id
from prescriptions p
where s.prescription_id = p.id
  and s.patient_id is null
  and p.patient_id is not null;

insert into suppliers (name)
select distinct btrim(supplier_name)
from supplier_invoices
where btrim(supplier_name) <> ''
  and not exists (
    select 1 from suppliers s where lower(s.name) = lower(btrim(supplier_invoices.supplier_name))
  );

insert into suppliers (name)
select distinct btrim(supplier_name)
from purchase_orders
where btrim(supplier_name) <> ''
  and not exists (
    select 1 from suppliers s where lower(s.name) = lower(btrim(purchase_orders.supplier_name))
  );

update supplier_invoices i
set supplier_id = s.id
from suppliers s
where i.supplier_id is null
  and lower(s.name) = lower(btrim(i.supplier_name));

update purchase_orders o
set supplier_id = s.id
from suppliers s
where o.supplier_id is null
  and lower(s.name) = lower(btrim(o.supplier_name));

update suppliers
set phone = '0788 300 100',
    contact_name = 'Aline Uwase',
    terms = 'Net 30 days',
    address = 'Gikondo, Kigali'
where lower(name) = 'kigali pharma wholesale'
  and phone = '';

update suppliers
set phone = '0788 200 440',
    contact_name = 'Desk',
    terms = 'Pay on receipt',
    address = 'Kigali'
where lower(name) = 'rwanda medical supply'
  and phone = '';
