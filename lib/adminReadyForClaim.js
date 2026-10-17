// Historical READY FOR CLAIM list only; not a public sale/certificate rule.
export function readyForClaimQuery(supabase) {
  return supabase
    .from('artworks')
    .select('*')
    .eq('status', 'OWNED')
    .eq('ownership_status', 'SOLD')
    .is('current_owner_id', null)
    .is('pending_owner_id', null)
    .is('claim_token', null)
    .order('created_at', { ascending: false })
}

export function isAdminReadyForClaim(artwork, { hasActiveClaim = false, hasActiveBatch = false } = {}) {
  if (!artwork) return false
  return artwork.status === 'OWNED' &&
    artwork.ownership_status === 'SOLD' &&
    artwork.current_owner_id === null &&
    artwork.pending_owner_id === null &&
    artwork.claim_token == null &&
    !hasActiveClaim && !hasActiveBatch
}