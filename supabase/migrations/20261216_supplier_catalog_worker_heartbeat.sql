-- Observability only: preserve all runs, counters, checkpoints and staged/catalog records.
alter table public.supplier_catalog_state add column last_worker_at timestamptz;

create or replace function public.claim_supplier_catalog_batch(_provider text, _token uuid) returns jsonb
language plpgsql security definer set search_path=public as $$
declare r supplier_catalog_runs; begin
  select * into r from supplier_catalog_runs where provider_code=_provider
    and status in ('queued','running','retry') and next_attempt_at<=now()
    and (lease_until is null or lease_until<now()) order by created_at for update skip locked limit 1;
  -- Take the run lock before the state lock, like activation. Also record idle/backoff invocations.
  update supplier_catalog_state set last_worker_at=now() where provider_code=_provider;
  if r.id is null then return null; end if;
  update supplier_catalog_runs set status='running',lease_token=_token,lease_until=now()+interval '90 seconds' where id=r.id;
  return to_jsonb(r);
end $$;
revoke all on function public.claim_supplier_catalog_batch(text,uuid) from public,anon,authenticated;
grant execute on function public.claim_supplier_catalog_batch(text,uuid) to service_role;

alter table public.supplier_catalog_runs add column last_error_details jsonb;
-- Keep the deployed failure RPC signature intact for in-flight/older callers.
create function public.fail_supplier_catalog_batch_detailed(
  _run uuid,_token uuid,_error text,_delay integer,_terminal boolean,_details jsonb
) returns void language plpgsql security definer set search_path=public as $$
begin
  perform 1 from supplier_catalog_runs where id=_run and status='running'
    and lease_token=_token and lease_until>now() for update;
  if not found then return; end if;
  perform fail_supplier_catalog_batch(_run,_token,_error,_delay,_terminal);
  update supplier_catalog_runs set last_error_details=_details || jsonb_build_object('observedAt',now()) where id=_run;
end $$;
revoke all on function public.fail_supplier_catalog_batch_detailed(uuid,uuid,text,integer,boolean,jsonb) from public,anon,authenticated;
grant execute on function public.fail_supplier_catalog_batch_detailed(uuid,uuid,text,integer,boolean,jsonb) to service_role;
