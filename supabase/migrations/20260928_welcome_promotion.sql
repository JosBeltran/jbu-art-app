-- Promoción de bienvenida: 30% en la primera compra para las primeras 5 cuentas nuevas.
create table if not exists public.promotion_campaigns (
  id text primary key,
  percent_off integer not null check (percent_off between 1 and 100),
  max_claims integer not null check (max_claims > 0),
  starts_at timestamptz not null default now(),
  active boolean not null default true
);
grant all on public.promotion_campaigns to service_role;
alter table public.promotion_campaigns enable row level security;

insert into public.promotion_campaigns (id, percent_off, max_claims)
values ('WELCOME30', 30, 5)
on conflict (id) do nothing;

create table if not exists public.welcome_promotions (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references auth.users(id) on delete cascade,
  promotion_id text not null references public.promotion_campaigns(id),
  status text not null default 'CLAIMED' check (status in ('CLAIMED', 'REDEEMED')),
  claimed_at timestamptz not null default now(),
  redeemed_at timestamptz,
  stripe_session_id text,
  unique (user_id, promotion_id)
);
grant select on public.welcome_promotions to authenticated;
grant all on public.welcome_promotions to service_role;
alter table public.welcome_promotions enable row level security;
drop policy if exists "Users read own welcome promotion" on public.welcome_promotions;
create policy "Users read own welcome promotion" on public.welcome_promotions
  for select to authenticated using (auth.uid() = user_id);

-- Reclamo atómico: el candado evita que dos registros simultáneos superen el límite.
create or replace function public.claim_welcome_promotion(_user_id uuid, _promotion_id text default 'WELCOME30')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.promotion_campaigns%rowtype;
  existing text;
  user_created timestamptz;
  used integer;
begin
  perform pg_advisory_xact_lock(hashtext('promo:' || _promotion_id));
  select * into campaign from public.promotion_campaigns where id = _promotion_id;
  if not found or not campaign.active then return 'CLOSED'; end if;

  select status into existing from public.welcome_promotions
    where user_id = _user_id and promotion_id = _promotion_id;
  if existing is not null then return existing; end if;

  select created_at into user_created from auth.users where id = _user_id;
  if user_created is null or user_created < campaign.starts_at then return 'NOT_ELIGIBLE'; end if;

  select count(*) into used from public.welcome_promotions where promotion_id = _promotion_id;
  if used >= campaign.max_claims then return 'SOLD_OUT'; end if;

  insert into public.welcome_promotions (user_id, promotion_id) values (_user_id, _promotion_id);
  return 'CLAIMED';
end;
$$;
revoke all on function public.claim_welcome_promotion(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_welcome_promotion(uuid, text) to service_role;
