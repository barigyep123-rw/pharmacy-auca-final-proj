-- Insurer rules for the counter. Coverage is a local reading of published schemes, not an RRA or RSSB feed.

alter table insurers add column if not exists phone text not null default '';
alter table insurers add column if not exists email text not null default '';
alter table insurers add column if not exists address text not null default '';
alter table insurers add column if not exists cover_percent integer not null default 0;
alter table insurers add column if not exists period text not null default 'month';
alter table insurers add column if not exists spending_limit integer;
alter table insurers add column if not exists limit_action text not null default 'warn';
alter table insurers add column if not exists stacks boolean not null default false;
alter table insurers add column if not exists formulary_mode text not null default 'list';
alter table insurers add column if not exists cover_otc boolean not null default false;
alter table insurers add column if not exists notes text not null default '';
alter table insurers add column if not exists active boolean not null default true;

update insurers set
  cover_percent = 85,
  period = 'year',
  formulary_mode = 'open',
  cover_otc = false,
  limit_action = 'warn',
  notes = 'RSSB Medical Scheme pays 85% of eligible prescribed medicines and the patient pays 15%. No single pharmacy spending cap is published; leave the limit empty unless the contract states one. Over-the-counter lines stay with the patient unless a formulary rule includes them.'
where lower(name) = 'rssb';

update insurers set
  cover_percent = 0,
  period = 'year',
  formulary_mode = 'list',
  cover_otc = false,
  notes = 'Mutuelle (CBHI) pays at public facilities. At this private counter the default is 0% until you add a formulary rule.'
where lower(name) = 'mutuelle';

update insurers set
  cover_percent = 80,
  period = 'year',
  formulary_mode = 'list',
  cover_otc = false,
  notes = 'MMI has no single published pharmacy co-pay. 80% is a local default. Add the tariff list before it pays anything, because the formulary is list-only.'
where lower(name) = 'mmi';

insert into insurers (name, kind, phone, email, address, cover_percent, period, spending_limit, limit_action, stacks, formulary_mode, cover_otc, notes)
select 'Britam', 'private', '+250 788 198 000', 'Rwanda@britam.com', '5th Floor KIC, P.O. Box 913, Kigali', 100, 'year', null, 'warn', false, 'open', false,
  'Britam outpatient cover includes prescribed medicines. The family limit is on the member schedule, not a national figure, so set that limit on the card period you use. Contact: +250 722 316 016.'
where not exists (select 1 from insurers i where lower(i.name) = 'britam');

insert into insurers (name, kind, phone, email, address, cover_percent, period, spending_limit, limit_action, stacks, formulary_mode, cover_otc, notes)
select 'UAP', 'private', '', '', '', 100, 'prescription', 80000, 'warn', false, 'list', false,
  'The August 2016 UAP pharmacy booklet capped a prescription at RWF 80,000 and did not cover OTC, cosmetics, or toilet soaps. That booklet may be out of date. Confirm the current contract.'
where not exists (select 1 from insurers i where lower(i.name) = 'uap');

insert into insurers (name, kind, phone, email, address, cover_percent, period, spending_limit, limit_action, stacks, formulary_mode, cover_otc, notes)
select 'Sanlam', 'private', '', '', '', 0, 'year', null, 'warn', false, 'list', false,
  'Sanlam is a private insurer in Rwanda. No pharmacy co-pay or formulary figure was found, so nothing is covered until you enter the member contract.'
where not exists (select 1 from insurers i where lower(i.name) = 'sanlam');

create table if not exists patient_policies (
  id integer generated always as identity primary key,
  patient_id integer not null references patients (id) on delete cascade,
  insurer_id integer not null references insurers (id),
  member_number text not null,
  active boolean not null default true,
  is_primary boolean not null default true,
  created_at timestamptz not null default now()
);

create unique index if not exists patient_policies_member_idx
  on patient_policies (insurer_id, lower(member_number));

create table if not exists coverage_rules (
  id integer generated always as identity primary key,
  insurer_id integer not null references insurers (id) on delete cascade,
  scope text not null check (scope in ('category', 'generic', 'brand')),
  name text not null,
  covered boolean not null default true,
  cover_percent integer,
  created_at timestamptz not null default now()
);

create table if not exists sale_coverages (
  id integer generated always as identity primary key,
  sale_id integer not null references sales (id) on delete cascade,
  insurer_id integer not null references insurers (id),
  member_number text not null default '',
  patient_payable integer not null check (patient_payable >= 0),
  insurer_amount integer not null check (insurer_amount >= 0),
  note text not null default ''
);

create table if not exists insurance_usage (
  id integer generated always as identity primary key,
  patient_id integer not null references patients (id),
  insurer_id integer not null references insurers (id),
  period_key text not null,
  amount integer not null check (amount >= 0),
  sale_id integer references sales (id),
  created_at timestamptz not null default now()
);

insert into coverage_rules (insurer_id, scope, name, covered, cover_percent)
select i.id, 'category', 'Antibiotic', true, 85
from insurers i
where lower(i.name) = 'rssb'
  and not exists (
    select 1 from coverage_rules r
    where r.insurer_id = i.id and r.scope = 'category' and lower(r.name) = 'antibiotic'
  );

insert into coverage_rules (insurer_id, scope, name, covered, cover_percent)
select i.id, 'category', 'Supplement', false, null
from insurers i
where lower(i.name) = 'uap'
  and not exists (
    select 1 from coverage_rules r
    where r.insurer_id = i.id and r.scope = 'category' and lower(r.name) = 'supplement'
  );

insert into coverage_rules (insurer_id, scope, name, covered, cover_percent)
select i.id, 'category', 'Cosmetic', false, null
from insurers i
where lower(i.name) = 'uap'
  and not exists (
    select 1 from coverage_rules r
    where r.insurer_id = i.id and r.scope = 'category' and lower(r.name) = 'cosmetic'
  );
