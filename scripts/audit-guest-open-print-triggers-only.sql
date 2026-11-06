-- READ ONLY. Return one result set only (Supabase SQL editor can show
-- just the last SELECT from a multi-statement script).
-- This script is specifically for the THREE triggers still missing.
-- Functions complete_order_originals and fulfill_stripe_order are excluded.
begin transaction read only;

select
  cl.relname as source_table,
  tg.tgname as trigger_name,
  fn.proname as function_name,
  pg_get_functiondef(fn.oid) as function_definition
from pg_trigger tg
join pg_class cl on cl.oid = tg.tgrelid
join pg_namespace ns on ns.oid = cl.relnamespace
join pg_proc fn on fn.oid = tg.tgfoid
where ns.nspname = 'public'
  and not tg.tgisinternal
  and (
    (cl.relname = 'orders' and tg.tgname in ('orders_notifications','trigger_award_xp'))
    or (cl.relname = 'order_items' and tg.tgname = 'block_unimplemented_physical_edition_sales')
  )
order by cl.relname, tg.tgname;

rollback;
