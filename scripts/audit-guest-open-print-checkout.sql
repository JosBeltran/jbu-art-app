-- JBU Guest Open Edition Checkout -- schema audit (READ ONLY).
-- Run against staging first. Returns ONE JSON document with structural metadata.
-- No customer records, emails, order rows, secrets or storage objects included.
begin transaction read only;

with audit as (
 select
  (select jsonb_agg(jsonb_build_object('table',table_name,'column',column_name,
    'type',data_type,'udt',udt_name,'nullable',is_nullable,'default',column_default)
    order by table_name,ordinal_position)
   from information_schema.columns where table_schema='public'
     and table_name in ('artwork_prints','cart_items','orders','order_items','artworks',
     'guest_open_print_checkouts')) as columns,
  (select jsonb_agg(jsonb_build_object('table',cl.relname,'name',con.conname,
    'type',con.contype,'definition',pg_get_constraintdef(con.oid)) order by cl.relname,con.conname)
   from pg_constraint con join pg_class cl on cl.oid=con.conrelid
   join pg_namespace ns on ns.oid=cl.relnamespace where ns.nspname='public'
     and cl.relname in ('artwork_prints','cart_items','orders','order_items','artworks')) as constraints,
  (select jsonb_agg(jsonb_build_object('table',tablename,'policy',policyname,'command',cmd,
    'roles',roles,'using',qual,'check',with_check) order by tablename,policyname)
   from pg_policies where schemaname='public' and
     tablename in ('artwork_prints','cart_items','orders','order_items','artworks')) as policies,
  (select jsonb_agg(jsonb_build_object('table',c.relname,'rls',c.relrowsecurity,
    'force_rls',c.relforcerowsecurity) order by c.relname)
   from pg_class c join pg_namespace n on n.oid=c.relnamespace where n.nspname='public'
     and c.relname in ('artwork_prints','cart_items','orders','order_items','artworks')) as rls,
  (select jsonb_agg(jsonb_build_object('table',c.relname,'trigger',t.tgname,
    'definition',pg_get_triggerdef(t.oid)) order by c.relname,t.tgname)
   from pg_trigger t join pg_class c on c.oid=t.tgrelid
   join pg_namespace n on n.oid=c.relnamespace where n.nspname='public' and not t.tgisinternal
     and c.relname in ('artwork_prints','cart_items','orders','order_items','artworks')) as triggers,
  (select jsonb_agg(jsonb_build_object('name',p.proname,'signature',
      pg_get_function_identity_arguments(p.oid),'result',pg_get_function_result(p.oid),
      'security_definer',p.prosecdef))
   from pg_proc p join pg_namespace n on n.oid=p.pronamespace
   where n.nspname='public' and p.proname in ('fulfill_stripe_order','complete_order_originals')) as functions
)
select jsonb_pretty(to_jsonb(audit)) as guest_open_print_schema_audit from audit;
rollback;
