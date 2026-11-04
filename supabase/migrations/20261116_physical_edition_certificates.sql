-- Unit-specific COAs. Never relax the existing one-active-COA-per-artwork
-- constraint on public.certificates: that table remains unique-original only.
begin;

create table if not exists public.physical_edition_certificates (
 id uuid primary key default gen_random_uuid(),
 unit_id uuid not null unique references public.artwork_edition_units(id) on delete restrict,
 artwork_id uuid not null references public.artworks(id) on delete restrict,
 owner_id uuid not null references auth.users(id) on delete restrict,
 certificate_number text not null unique,
 sku text not null unique,
 title text not null,
 artist text,
 year text,
 medium text,
 technique text,
 dimensions text,
 edition text not null,
 edition_type text not null default 'PHYSICAL_LIMITED_EDITION',
 primary_image_url text,
 owner_name_snapshot text,
 issued_at timestamptz not null,
 canonical_version text not null default 'jbu-coa-v1',
 data_hash text not null check(data_hash ~ '^[0-9a-f]{64}$'),
 version integer not null default 1 check(version=1),
 status text not null default 'ISSUED' check(status='ISSUED'),
 pdf_storage_path text,
 pdf_hash text check(pdf_hash is null or pdf_hash ~ '^[0-9a-f]{64}$'),
 pdf_created_at timestamptz,
 created_at timestamptz not null default now(),
 check ((pdf_storage_path is null) = (pdf_hash is null))
);
alter table public.artwork_edition_units
 add column if not exists physical_certificate_id uuid unique references public.physical_edition_certificates(id) on delete restrict;

create index if not exists physical_edition_certificates_artwork_idx
 on public.physical_edition_certificates(artwork_id);
alter table public.physical_edition_certificates enable row level security;
revoke all on public.physical_edition_certificates from public,anon,authenticated;
grant all on public.physical_edition_certificates to service_role;

create or replace function public.guard_physical_edition_certificate_immutable()
returns trigger language plpgsql set search_path=public as $$
begin
 if (to_jsonb(new) - 'pdf_storage_path' - 'pdf_hash' - 'pdf_created_at')
     is distinct from
    (to_jsonb(old) - 'pdf_storage_path' - 'pdf_hash' - 'pdf_created_at')
 then raise exception 'physical_edition_certificate_immutable';end if;
 if old.pdf_hash is not null and
  (new.pdf_hash,new.pdf_storage_path,new.pdf_created_at) is distinct from
  (old.pdf_hash,old.pdf_storage_path,old.pdf_created_at)
 then raise exception 'physical_edition_pdf_immutable';end if;
 return new;
end $$;
drop trigger if exists physical_edition_certificate_immutable on public.physical_edition_certificates;
create trigger physical_edition_certificate_immutable
 before update on public.physical_edition_certificates for each row
 execute function public.guard_physical_edition_certificate_immutable();

-- Only issued after delivery and paid, and only to the authenticated buyer.
-- Service-only: a trusted API computes SHA-256 over a frozen canonical snapshot.
create or replace function public.issue_physical_edition_certificate(
 _unit uuid,_owner uuid,_issued_at timestamptz,_data_hash text,
 _snapshot jsonb
) returns jsonb language plpgsql security definer set search_path=public as $$
declare u public.artwork_edition_units%rowtype;
 a public.artworks%rowtype; oi public.order_items%rowtype;
 o public.orders%rowtype;c public.physical_edition_certificates%rowtype;
 edition_name text;cn text;begin
 if _unit is null or _owner is null or _issued_at is null or
  _data_hash !~ '^[0-9a-f]{64}$' or _snapshot is null
 then raise exception 'invalid_edition_certificate';end if;
 select * into u from public.artwork_edition_units where id=_unit for update;
 if not found or u.status<>'SOLD' or u.order_item_id is null
 then raise exception 'unit_not_sold';end if;
 select * into c from public.physical_edition_certificates where unit_id=_unit;
 if found then
  if c.owner_id is distinct from _owner then raise exception 'certificate_owner_conflict';end if;
  return jsonb_build_object('created',false,'certificate',to_jsonb(c));end if;
 select * into oi from public.order_items where id=u.order_item_id;
 select * into o from public.orders where id=oi.order_id;
 if o.buyer_user_id is distinct from _owner or o.payment_status<>'PAID' or
  o.status::text<>'DELIVERED'
 then raise exception 'certificate_requires_paid_delivery';end if;
 select * into a from public.artworks where id=u.artwork_id;
 if a.physical_edition_type<>'LIMITED_EDITION' or oi.physical_edition_unit_id is distinct from u.id
 then raise exception 'edition_sale_integrity_error';end if;
 edition_name:=lpad(u.edition_number::text,greatest(3,length(a.physical_edition_size::text)),'0')
    ||'/'||lpad(a.physical_edition_size::text,greatest(3,length(a.physical_edition_size::text)),'0');
 if _snapshot->>'sku' is distinct from u.unit_identifier or
    _snapshot->>'title' is distinct from a.title or
    _snapshot->>'edition' is distinct from edition_name or
    _snapshot->>'edition_type' is distinct from 'PHYSICAL_LIMITED_EDITION'
 then raise exception 'edition_certificate_snapshot_mismatch';end if;
 cn:='COA-'||upper(u.unit_identifier);
 insert into public.physical_edition_certificates
  (unit_id,artwork_id,owner_id,certificate_number,sku,title,artist,year,
   medium,technique,dimensions,edition,edition_type,primary_image_url,
   issued_at,data_hash,owner_name_snapshot)
 values(u.id,a.id,_owner,cn,u.unit_identifier,a.title,_snapshot->>'artist',
   a.year::text,_snapshot->>'medium',_snapshot->>'technique',_snapshot->>'dimensions',
   edition_name,'PHYSICAL_LIMITED_EDITION',_snapshot->>'primary_image_url',
   _issued_at,_data_hash,null)
 returning * into c;
 update public.artwork_edition_units set physical_certificate_id=c.id where id=u.id;
 return jsonb_build_object('created',true,'certificate',to_jsonb(c));
end $$;
revoke all on function public.issue_physical_edition_certificate(uuid,uuid,timestamptz,text,jsonb)
 from public,anon,authenticated;
grant execute on function public.issue_physical_edition_certificate(uuid,uuid,timestamptz,text,jsonb)
 to service_role;

create or replace function public.attach_physical_edition_certificate_pdf(
 _certificate uuid,_path text,_hash text
) returns jsonb language plpgsql security definer set search_path=public as $$
declare c public.physical_edition_certificates%rowtype;begin
 if nullif(trim(_path),'') is null or _hash !~ '^[0-9a-f]{64}$' then raise exception 'invalid_pdf_metadata';end if;
 select * into c from public.physical_edition_certificates where id=_certificate for update;
 if not found then raise exception 'edition_certificate_not_found';end if;
 if c.pdf_hash is not null then
  if c.pdf_hash is distinct from _hash or c.pdf_storage_path is distinct from _path
  then raise exception 'pdf_hash_conflict';end if;
  return to_jsonb(c);end if;
 update public.physical_edition_certificates
 set pdf_storage_path=_path,pdf_hash=_hash,pdf_created_at=now()
 where id=_certificate returning * into c;
 return to_jsonb(c);
end $$;
revoke all on function public.attach_physical_edition_certificate_pdf(uuid,text,text)
 from public,anon,authenticated;
grant execute on function public.attach_physical_edition_certificate_pdf(uuid,text,text)
 to service_role;

commit;
