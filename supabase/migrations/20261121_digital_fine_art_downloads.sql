begin;

insert into storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
values ('digital-art-masters', 'digital-art-masters', false, 52428800, array['image/jpeg','image/png'])
on conflict (id) do update set public = false, file_size_limit = excluded.file_size_limit,
  allowed_mime_types = excluded.allowed_mime_types;

-- Restrictive policies also fence off broad policies for existing public media buckets.
create policy digital_masters_private on storage.objects as restrictive
for all to anon, authenticated
using (bucket_id <> 'digital-art-masters')
with check (bucket_id <> 'digital-art-masters');

create table public.digital_art_variants (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  revision uuid not null default gen_random_uuid(),
  size text not null check (char_length(size) between 1 and 60),
  width_mm numeric(7,2) not null check (width_mm between 1 and 2000),
  height_mm numeric(7,2) not null check (height_mm between 1 and 2000),
  dpi integer not null check (dpi between 72 and 600),
  print_notes text not null default '' check (char_length(print_notes) <= 1000),
  currency text not null check (currency in ('MXN', 'USD')),
  amount_minor integer not null check (amount_minor between 1 and 99999999),
  download_limit integer not null default 3 check (download_limit between 1 and 20),
  active boolean not null default false,
  master_path text,
  master_name text,
  pixel_width integer check (pixel_width > 0),
  pixel_height integer check (pixel_height > 0),
  check (not active or (
    master_path is not null and master_name is not null
    and pixel_width is not null and pixel_height is not null
    and least(pixel_width, pixel_height) >= ceil(least(width_mm, height_mm) * dpi / 25.4)
    and greatest(pixel_width, pixel_height) >= ceil(greatest(width_mm, height_mm) * dpi / 25.4)
  ))
);
create index digital_art_variants_artwork_idx on public.digital_art_variants (artwork_id);

-- A checkout snapshots the purchased revision. Replacing a master or removing its
-- artwork never changes delivery for an existing purchase.
create table public.digital_art_purchases (
  id uuid primary key default gen_random_uuid(),
  variant_id uuid not null,
  buyer_user_id uuid,
  guest_token_hash text,
  artwork_title text not null,
  size text not null,
  master_path text not null,
  master_name text not null,
  currency text not null,
  amount_minor integer not null,
  download_limit integer not null check (download_limit between 1 and 20),
  downloads_issued integer not null default 0 check (downloads_issued between 0 and download_limit),
  stripe_session_id text unique,
  stripe_payment_intent_id text unique,
  paid_at timestamptz,
  revoked_at timestamptz,
  created_at timestamptz not null default now(),
  check ((buyer_user_id is null) <> (guest_token_hash is null))
);

create table public.digital_art_tickets (
  token_hash text primary key,
  purchase_id uuid not null references public.digital_art_purchases(id) on delete cascade,
  expires_at timestamptz not null
);

alter table public.digital_art_variants enable row level security;
alter table public.digital_art_purchases enable row level security;
alter table public.digital_art_tickets enable row level security;
revoke all on public.digital_art_variants, public.digital_art_purchases, public.digital_art_tickets
  from public, anon, authenticated;
grant select, insert, update on public.digital_art_variants, public.digital_art_purchases to service_role;
grant select, insert, delete on public.digital_art_tickets to service_role;

create function public.prepare_digital_art_purchase(_variant uuid, _buyer uuid, _guest_hash text)
returns table (id uuid, artwork_title text, size text, currency text, amount_minor integer)
language sql set search_path = '' as $$
  insert into public.digital_art_purchases as p
    (variant_id, buyer_user_id, guest_token_hash, artwork_title, size,
     master_path, master_name, currency, amount_minor, download_limit)
  select v.id, _buyer, _guest_hash, a.title, v.size,
    v.master_path, v.master_name, v.currency, v.amount_minor, v.download_limit
  from public.digital_art_variants v
  join public.artworks_discoverable a on a.id = v.artwork_id
  where v.id = _variant and v.active
  returning p.id, p.artwork_title, p.size, p.currency, p.amount_minor;
$$;

create function public.fulfill_digital_art_purchase(
  _purchase uuid, _session text, _intent text, _currency text, _amount integer
) returns boolean
language sql set search_path = '' as $$
  with paid as (
    update public.digital_art_purchases
    set paid_at = coalesce(paid_at, now()), stripe_payment_intent_id = _intent
    where id = _purchase and stripe_session_id = _session
      and _intent is not null and _intent <> ''
      and currency = _currency and amount_minor = _amount
      and (stripe_payment_intent_id is null or stripe_payment_intent_id = _intent)
    returning id
  )
  select exists (select 1 from paid);
$$;

create function public.issue_digital_art_ticket(
  _purchase uuid, _buyer uuid, _guest_hash text, _ticket_hash text
) returns boolean
language sql set search_path = '' as $$
  with claimed as (
    update public.digital_art_purchases
    set downloads_issued = downloads_issued + 1
    where id = _purchase and paid_at is not null and revoked_at is null
      and downloads_issued < download_limit
      and (buyer_user_id = _buyer or guest_token_hash = _guest_hash)
    returning id
  ), issued as (
    insert into public.digital_art_tickets (token_hash, purchase_id, expires_at)
    select _ticket_hash, id, now() + interval '2 minutes' from claimed
    returning token_hash
  )
  select exists (select 1 from issued);
$$;

create function public.redeem_digital_art_ticket(_ticket_hash text)
returns table (master_path text, master_name text)
language sql set search_path = '' as $$
  with redeemed as (
    delete from public.digital_art_tickets
    where token_hash = _ticket_hash and expires_at > now()
    returning purchase_id
  )
  select p.master_path, p.master_name
  from redeemed r join public.digital_art_purchases p on p.id = r.purchase_id
  where p.paid_at is not null and p.revoked_at is null;
$$;

revoke execute on function public.prepare_digital_art_purchase(uuid, uuid, text),
  public.fulfill_digital_art_purchase(uuid, text, text, text, integer),
  public.issue_digital_art_ticket(uuid, uuid, text, text),
  public.redeem_digital_art_ticket(text) from public, anon, authenticated;
grant execute on function public.prepare_digital_art_purchase(uuid, uuid, text),
  public.fulfill_digital_art_purchase(uuid, text, text, text, integer),
  public.issue_digital_art_ticket(uuid, uuid, text, text),
  public.redeem_digital_art_ticket(text) to service_role;

commit;
