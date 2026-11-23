create table if not exists users (
  id integer generated always as identity primary key,
  name text not null,
  email text not null unique,
  password_hash text not null,
  role text not null check (role in ('admin', 'pharmacist')),
  created_at timestamptz not null default now()
);

create table if not exists drugs (
  id integer generated always as identity primary key,
  name text not null,
  generic_name text not null default '',
  category text not null default '',
  form text not null default 'tablet',
  strength text not null default '',
  sku text not null unique,
  unit_price integer not null check (unit_price >= 0),
  quantity integer not null default 0 check (quantity >= 0),
  reorder_level integer not null default 0 check (reorder_level >= 0),
  expiry_date text not null,
  batch_number text not null default '',
  supplier text not null default '',
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table if not exists prescriptions (
  id integer generated always as identity primary key,
  patient_name text not null,
  patient_phone text not null default '',
  doctor_name text not null default '',
  notes text not null default '',
  status text not null check (status in ('pending', 'dispensed', 'cancelled')),
  created_by integer not null references users (id),
  dispensed_by integer references users (id),
  dispensed_at timestamptz,
  created_at timestamptz not null default now()
);

create table if not exists prescription_items (
  id integer generated always as identity primary key,
  prescription_id integer not null references prescriptions (id) on delete cascade,
  drug_id integer not null references drugs (id),
  quantity integer not null check (quantity > 0),
  dosage text not null default '',
  unit_price integer not null check (unit_price >= 0)
);

create table if not exists sales (
  id integer generated always as identity primary key,
  drug_id integer not null references drugs (id),
  quantity integer not null check (quantity > 0),
  unit_price integer not null check (unit_price >= 0),
  total integer not null check (total >= 0),
  customer_name text not null default '',
  sold_by integer not null references users (id),
  prescription_id integer references prescriptions (id),
  created_at timestamptz not null default now()
);

create table if not exists purchase_orders (
  id integer generated always as identity primary key,
  supplier_name text not null,
  status text not null check (status in ('ordered', 'received', 'cancelled')),
  notes text not null default '',
  ordered_by integer not null references users (id),
  received_by integer references users (id),
  ordered_at timestamptz not null default now(),
  received_at timestamptz
);

create table if not exists purchase_order_items (
  id integer generated always as identity primary key,
  order_id integer not null references purchase_orders (id) on delete cascade,
  drug_id integer not null references drugs (id),
  quantity integer not null check (quantity > 0),
  unit_cost integer not null default 0 check (unit_cost >= 0),
  expiry_date text,
  batch_number text not null default ''
);

create table if not exists sessions (
  token text primary key,
  user_id integer not null references users (id) on delete cascade,
  expires_at timestamptz not null
);

create index if not exists sales_created_idx on sales (created_at desc);
create index if not exists sales_drug_idx on sales (drug_id);
create index if not exists sessions_user_idx on sessions (user_id);
