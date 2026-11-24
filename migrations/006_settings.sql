create table if not exists currencies (
  id integer generated always as identity primary key,
  code text not null unique,
  name text not null,
  symbol text not null,
  is_default boolean not null default false,
  active boolean not null default true
);

create unique index if not exists currencies_one_default
  on currencies (is_default) where is_default;

create table if not exists payment_methods (
  id integer generated always as identity primary key,
  code text not null unique,
  name text not null,
  kind text not null check (kind in ('cash', 'mobile_money', 'card', 'credit', 'custom')),
  settles_immediately boolean not null,
  active boolean not null default true,
  sort_order integer not null default 0
);

create table if not exists business_profile (
  id integer primary key check (id = 1),
  name text not null,
  phone text not null default '',
  email text not null default '',
  address text not null default '',
  receipt_prefix text not null default 'UBZ',
  receipt_next integer not null default 1 check (receipt_next > 0),
  receipt_padding integer not null default 4 check (receipt_padding between 1 and 8),
  tax_rate_bps integer not null default 0 check (tax_rate_bps between 0 and 10000),
  prices_include_tax boolean not null default true,
  default_discount_bps integer not null default 0 check (default_discount_bps between 0 and 10000),
  allow_line_discount boolean not null default true,
  default_reorder_level integer not null default 10 check (default_reorder_level >= 0)
);

insert into currencies (code, name, symbol, is_default)
values ('RWF', 'Rwandan franc', 'FRw', true)
on conflict (code) do nothing;

insert into payment_methods (code, name, kind, settles_immediately, sort_order) values
  ('cash', 'Cash', 'cash', true, 1),
  ('mobile_money', 'Mobile money', 'mobile_money', true, 2),
  ('card', 'Card', 'card', true, 3),
  ('credit', 'Credit', 'credit', false, 4)
on conflict (code) do nothing;

insert into business_profile (id, name, address)
values (1, 'Pharmacie Ubuzima', 'Kimironko, Kigali')
on conflict (id) do nothing;

alter table sales add column if not exists payment_method_id integer references payment_methods (id);
alter table sales add column if not exists currency_id integer references currencies (id);
alter table sales add column if not exists receipt_number text;

create unique index if not exists sales_receipt_number_idx
  on sales (receipt_number) where receipt_number is not null;
