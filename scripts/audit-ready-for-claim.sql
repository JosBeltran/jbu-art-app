-- READ ONLY. No migration; no writes. Run in the database SQL editor.
-- Previous and corrected operational lists evaluated on the SAME snapshot.
WITH candidates AS (
  SELECT a.id, a.sku, a.title, a.status, a.ownership_status,
    a.availability_status,
    a.current_owner_id IS NOT NULL AS has_current_owner,
    a.pending_owner_id IS NOT NULL AS has_pending_owner,
    a.claim_token IS NOT NULL AS has_claim_invitation,
    EXISTS (
      SELECT 1 FROM public.order_items i
      WHERE i.artwork_id = a.id
        AND i.claim_group_id IS NOT NULL AND i.is_claimed = false
    ) AS has_active_batch
  FROM public.artworks a
), evaluated AS (
  SELECT *,
    (availability_status::text = 'SOLD' AND ownership_status::text = 'SOLD'
      AND NOT has_current_owner AND NOT has_pending_owner AND NOT has_active_batch) AS previous_ready,
    (status::text = 'OWNED' AND ownership_status::text = 'SOLD'
      AND NOT has_current_owner AND NOT has_pending_owner
      AND NOT has_claim_invitation AND NOT has_active_batch) AS corrected_ready
  FROM candidates
)
SELECT jsonb_build_object(
  'previous_ready_count', (SELECT count(*) FROM evaluated WHERE previous_ready),
  'owned_sold_count_before_safety_exclusions', (SELECT count(*) FROM evaluated WHERE status::text = 'OWNED' AND ownership_status::text = 'SOLD'),
  'corrected_ready_count', (SELECT count(*) FROM evaluated WHERE corrected_ready),
  'excluded_rows', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM evaluated e WHERE previous_ready AND NOT corrected_ready), '[]'::jsonb),
  'correctly_included_rows', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM evaluated e WHERE corrected_ready), '[]'::jsonb),
  'newly_included_rows', coalesce((SELECT jsonb_agg(to_jsonb(e)) FROM evaluated e WHERE corrected_ready AND NOT previous_ready), '[]'::jsonb)
) AS ready_for_claim_audit;