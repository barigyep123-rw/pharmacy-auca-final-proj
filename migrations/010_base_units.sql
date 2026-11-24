alter table drugs add column if not exists base_unit text not null default 'tablet';
alter table drugs add column if not exists pack_unit text not null default 'box';
alter table drugs add column if not exists units_per_pack integer not null default 1;

alter table drugs drop constraint if exists drugs_units_per_pack_check;
alter table drugs add constraint drugs_units_per_pack_check check (units_per_pack >= 1);

update drugs set
  base_unit = case form
    when 'sachet' then 'sachet'
    when 'syrup' then 'bottle'
    when 'drops' then 'bottle'
    when 'inhaler' then 'inhaler'
    when 'cream' then 'tube'
    when 'capsule' then 'capsule'
    else 'tablet'
  end,
  pack_unit = case form
    when 'syrup' then 'carton'
    when 'drops' then 'carton'
    when 'inhaler' then 'carton'
    else 'box'
  end,
  units_per_pack = case form
    when 'syrup' then 12
    when 'sachet' then 10
    when 'capsule' then 10
    when 'tablet' then 10
    else 1
  end
where units_per_pack = 1 and base_unit = 'tablet' and pack_unit = 'box';

alter table sales add column if not exists sold_as text not null default 'base';
alter table sales drop constraint if exists sales_sold_as_check;
alter table sales add constraint sales_sold_as_check check (sold_as in ('base', 'pack'));

alter table purchase_orders drop constraint if exists purchase_orders_status_check;
alter table purchase_orders add constraint purchase_orders_status_check
  check (status in ('draft', 'ordered', 'received', 'cancelled'));

alter table purchase_order_items add column if not exists entered_packs integer;

create table if not exists reorder_scans (
  id integer generated always as identity primary key,
  ran_by integer references users (id),
  drafts integer not null default 0,
  lines integer not null default 0,
  created_at timestamptz not null default now()
);
