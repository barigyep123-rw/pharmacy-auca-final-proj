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
  check (role in ('admin', 'pharmacist', 'stock_keeper', 'cashier'));

alter table users add column if not exists active boolean not null default true;
