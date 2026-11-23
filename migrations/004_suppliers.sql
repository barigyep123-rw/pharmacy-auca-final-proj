create table if not exists suppliers (
  id integer generated always as identity primary key,
  name text not null,
  created_at timestamptz not null default now()
);

create unique index if not exists suppliers_name_lower_idx on suppliers (lower(name));
