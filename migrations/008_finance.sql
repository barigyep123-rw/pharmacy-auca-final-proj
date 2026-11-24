create table if not exists supplier_invoices (
  id integer generated always as identity primary key,
  supplier_name text not null,
  invoice_number text not null,
  purchase_order_id integer references purchase_orders (id) on delete set null,
  amount integer not null check (amount >= 0),
  status text not null default 'open' check (status in ('open', 'paid')),
  issued_on text not null,
  notes text not null default '',
  created_by integer not null references users (id),
  paid_at timestamptz,
  created_at timestamptz not null default now()
);

create unique index if not exists supplier_invoices_ref_idx
  on supplier_invoices (lower(supplier_name), lower(invoice_number));

create table if not exists collections (
  id integer generated always as identity primary key,
  sale_id integer not null references sales (id),
  amount integer not null check (amount > 0),
  payment_method_id integer not null references payment_methods (id),
  collected_by integer not null references users (id),
  created_at timestamptz not null default now()
);

create table if not exists ledger_entries (
  id integer generated always as identity primary key,
  kind text not null check (kind in ('sale', 'collection', 'supplier_invoice')),
  direction text not null check (direction in ('in', 'out')),
  amount integer not null check (amount >= 0),
  payment_method_id integer references payment_methods (id),
  sale_id integer references sales (id),
  supplier_invoice_id integer references supplier_invoices (id),
  note text not null default '',
  created_by integer not null references users (id),
  created_at timestamptz not null default now()
);

insert into ledger_entries (kind, direction, amount, payment_method_id, sale_id, created_by, created_at)
select 'sale', 'in', s.total, s.payment_method_id, s.id, s.sold_by, s.created_at
from sales s
left join payment_methods m on m.id = s.payment_method_id
where coalesce(m.settles_immediately, true)
  and not exists (
    select 1 from ledger_entries e where e.sale_id = s.id and e.kind = 'sale'
  );
