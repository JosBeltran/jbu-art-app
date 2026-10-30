-- Apply and COMMIT this migration before 20261109 (Postgres enum additions cannot be used in the same transaction).
alter type public.order_status add value if not exists 'PENDING_CONFIRMATION';
alter type public.order_status add value if not exists 'CONFIRMED';
