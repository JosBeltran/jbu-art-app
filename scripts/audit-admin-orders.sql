-- READ ONLY. Run in the production SQL editor to diagnose the existing model before any permission changes.
select column_name, data_type, udt_name, is_nullable
from information_schema.columns where table_schema = 'public' and table_name in ('orders', 'user_roles')
order by table_name, ordinal_position;

select e.enumlabel from pg_enum e join pg_type t on t.oid = e.enumtypid
join information_schema.columns c on c.udt_name = t.typname
where c.table_schema = 'public' and c.table_name = 'orders' and c.column_name = 'status'
order by e.enumsortorder;

select conname, pg_get_constraintdef(oid) as definition
from pg_constraint where conrelid = to_regclass('public.orders');

select schemaname, tablename, policyname, roles, cmd, qual, with_check
from pg_policies where schemaname = 'public' and tablename in ('orders', 'order_items', 'user_roles');

select grantee, table_name, privilege_type from information_schema.role_table_grants
where table_schema = 'public' and table_name in ('orders', 'order_items', 'user_roles')
order by table_name, grantee;

select c.relname, c.relrowsecurity from pg_class c join pg_namespace n on n.oid = c.relnamespace
where n.nspname = 'public' and c.relname in ('orders', 'order_items', 'user_roles');

select tgname, pg_get_triggerdef(oid) as definition from pg_trigger
where tgrelid = to_regclass('public.orders') and not tgisinternal;

select to_regclass('public.user_roles') as separate_roles_table;
select status, count(*) from public.orders group by status order by status;