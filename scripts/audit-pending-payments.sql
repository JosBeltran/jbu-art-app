-- READ ONLY. Run before applying 20261102. No customer emails or secrets returned.
select table_name,column_name,data_type,udt_name,is_nullable,column_default
from information_schema.columns where table_schema='public' and table_name in('artwork_offers','auctions','orders','order_items','certificates','user_roles') order by table_name,ordinal_position;
select c.relname as table_name,con.conname,pg_get_constraintdef(con.oid) as definition
from pg_constraint con join pg_class c on c.oid=con.conrelid join pg_namespace n on n.oid=c.relnamespace
where n.nspname='public' and c.relname in('artwork_offers','auctions','orders','order_items','certificates','user_roles');
select p.proname,pg_get_function_identity_arguments(p.oid) as arguments,pg_get_functiondef(p.oid) as definition
from pg_proc p join pg_namespace n on n.oid=p.pronamespace where n.nspname='public' and p.proname in('settle_auctions','complete_auction_sale','place_bid');
select schemaname,tablename,policyname,roles,cmd,qual,with_check from pg_policies where schemaname='public' and tablename in('artwork_offers','auctions','orders','user_roles');
select status::text,count(*) from public.artwork_offers group by status::text;
select status,payment_status,count(*),count(*) filter(where payment_due_at is null) as missing_deadline,count(*) filter(where payment_status='PENDING' and payment_due_at<=now()) as overdue from public.auctions group by status,payment_status;
select extname from pg_extension where extname in('pgcrypto','pg_cron');
