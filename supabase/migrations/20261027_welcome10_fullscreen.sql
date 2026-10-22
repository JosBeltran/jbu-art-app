-- Promoción de bienvenida 10%: reemplaza WELCOME30 y permite registrar el
-- beneficio por correo antes de crear cuenta (se asocia al registrarse).
update public.promotion_campaigns set active = false where id = 'WELCOME30';

insert into public.promotion_campaigns (id, percent_off, max_claims)
values ('WELCOME10', 10, 1000)
on conflict (id) do update set percent_off = 10, active = true;

alter table public.welcome_promotions alter column user_id drop not null;
alter table public.welcome_promotions add column if not exists email text;

-- Un solo beneficio por correo (sin distinguir mayúsculas).
create unique index if not exists welcome_promotions_email_key
  on public.welcome_promotions (lower(email)) where email is not null;

-- Reclamo por correo (visitante sin sesión). La base de datos aplica todas las reglas.
create or replace function public.claim_welcome_promotion_by_email(_email text, _promotion_id text default 'WELCOME10')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.promotion_campaigns%rowtype;
  existing text;
  owner_id uuid;
  used integer;
begin
  if _email is null or _email !~ '^[^@\s]+@[^@\s]+\.[^@\s]+$' then return 'INVALID_EMAIL'; end if;

  perform pg_advisory_xact_lock(hashtext('promo:' || _promotion_id));
  select * into campaign from public.promotion_campaigns where id = _promotion_id;
  if not found or not campaign.active then return 'CLOSED'; end if;

  select status into existing from public.welcome_promotions
    where promotion_id = _promotion_id and lower(email) = lower(_email);
  if existing is not null then return existing; end if;

  select id into owner_id from auth.users where lower(email) = lower(_email) limit 1;
  if owner_id is not null then
    select status into existing from public.welcome_promotions
      where user_id = owner_id and promotion_id = _promotion_id;
    if existing is not null then return existing; end if;
    -- Elegibilidad: el correo nunca ha completado un pedido.
    if exists (select 1 from public.orders where lower(buyer_email) = lower(_email)) then
      return 'NOT_ELIGIBLE';
    end if;
  end if;

  select count(*) into used from public.welcome_promotions where promotion_id = _promotion_id;
  if used >= campaign.max_claims then return 'SOLD_OUT'; end if;

  insert into public.welcome_promotions (user_id, email, promotion_id) values (owner_id, lower(_email), _promotion_id);
  return 'CLAIMED';
end;
$$;
revoke all on function public.claim_welcome_promotion_by_email(text, text) from public, anon, authenticated;
grant execute on function public.claim_welcome_promotion_by_email(text, text) to service_role;

-- Reclamo con sesión: asocia beneficios pendientes del mismo correo y exige
-- que el usuario nunca haya completado un pedido.
create or replace function public.claim_welcome_promotion(_user_id uuid, _promotion_id text default 'WELCOME10')
returns text
language plpgsql
security definer
set search_path = public
as $$
declare
  campaign public.promotion_campaigns%rowtype;
  existing text;
  user_email text;
  pending_id uuid;
  used integer;
begin
  perform pg_advisory_xact_lock(hashtext('promo:' || _promotion_id));
  select * into campaign from public.promotion_campaigns where id = _promotion_id;
  if not found or not campaign.active then return 'CLOSED'; end if;

  select status into existing from public.welcome_promotions
    where user_id = _user_id and promotion_id = _promotion_id;
  if existing is not null then return existing; end if;

  select email into user_email from auth.users where id = _user_id;
  if user_email is null then return 'NOT_ELIGIBLE'; end if;

  -- Beneficio registrado por correo antes de crear cuenta: se asocia ahora.
  select id into pending_id from public.welcome_promotions
    where promotion_id = _promotion_id and user_id is null and lower(email) = lower(user_email)
    limit 1;
  if pending_id is not null then
    update public.welcome_promotions set user_id = _user_id where id = pending_id;
    return 'CLAIMED';
  end if;

  if exists (select 1 from public.orders where lower(buyer_email) = lower(user_email)) then
    return 'NOT_ELIGIBLE';
  end if;

  select count(*) into used from public.welcome_promotions where promotion_id = _promotion_id;
  if used >= campaign.max_claims then return 'SOLD_OUT'; end if;

  insert into public.welcome_promotions (user_id, email, promotion_id) values (_user_id, lower(user_email), _promotion_id);
  return 'CLAIMED';
end;
$$;
revoke all on function public.claim_welcome_promotion(uuid, text) from public, anon, authenticated;
grant execute on function public.claim_welcome_promotion(uuid, text) to service_role;
