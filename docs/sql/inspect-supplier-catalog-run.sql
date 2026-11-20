-- READ ONLY. Run in the existing Supabase SQL editor with privileged read access.
-- This uses only columns already deployed by 20261215; the observability migration is not required.
select
  now() as observed_at,
  r.id, r.provider_code, r.status,
  r.pages, r.attempts, r.errors, r.last_error,
  r.next_attempt_at, r.lease_until,
  r.created_at, r.completed_at,
  r.checkpoint, r.stats,
  s.active_revision, s.last_success_at,
  s.schedule_enabled, s.interval_hours, s.next_refresh_at,
  (
    r.status in ('queued', 'running', 'retry')
    and r.next_attempt_at <= now()
    and (r.lease_until is null or r.lease_until < now())
  ) as eligible_for_worker,
  (select count(*) from public.supplier_catalog_entries e where e.revision = r.id) as unique_staged_variants,
  (select count(distinct e.group_key) from public.supplier_catalog_entries e where e.revision = r.id) as staged_groups
from public.supplier_catalog_runs r
left join public.supplier_catalog_state s on s.provider_code = r.provider_code
where r.id = '44ab91a4-9973-4b5f-9ad6-9e604b42d33a'::uuid;
