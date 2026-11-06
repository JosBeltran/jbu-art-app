-- READ ONLY: inspect actual trigger function bodies before applying the proposed
-- guest Open Edition migration. Audit previously returned trigger headers only.
-- This reveals code, never customer data. Run only in your own SQL Editor.
begin transaction read only;

select
  c.relname as trigger_table,
  t.tgname as trigger_name,
  p.proname as function_name,
  pg_get_functiondef(p.oid) as function_definition
from pg_trigger t
join pg_class c on c.oid=t.tgrelid
join pg_namespace n on n.oid=c.relnamespace
join pg_proc p on p.oid=t.tgfoid
where n.nspname='public'
  and not t.tgisinternal
  and c.relname in ('orders','order_items')
order by c.relname,t.tgname;

select p.proname, pg_get_functiondef(p.oid) as function_definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace
where n.nspname='public'
  and p.proname in ('complete_order_originals','fulfill_stripe_order')
order by p.proname;

rollback;
