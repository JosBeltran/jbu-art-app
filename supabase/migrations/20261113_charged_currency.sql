-- Moneda realmente cobrada por Stripe (MXN o USD). Aditiva: los importes *_mxn
-- siguen siendo la referencia contable y de validación de las funciones existentes.
begin;
alter table public.orders add column if not exists charged_currency text not null default 'MXN';
alter table public.orders add column if not exists charged_amount numeric(12,2);
alter table public.orders add column if not exists fx_usd_per_mxn numeric(12,8);
do $$ begin
  if not exists (select 1 from pg_constraint where conname = 'orders_charged_currency_check') then
    alter table public.orders add constraint orders_charged_currency_check check (charged_currency in ('MXN','USD'));
  end if;
  if not exists (select 1 from pg_constraint where conname = 'orders_charged_fx_check') then
    alter table public.orders add constraint orders_charged_fx_check check (charged_currency = 'MXN' or (fx_usd_per_mxn is not null and fx_usd_per_mxn > 0));
  end if;
end $$;
comment on column public.orders.charged_currency is 'Moneda cobrada en Stripe; total_amount_mxn sigue siendo el equivalente MXN.';
commit;
