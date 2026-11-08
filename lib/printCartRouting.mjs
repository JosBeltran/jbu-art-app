// Explicit routing: OPEN prints may be stored in the guest cart; LIMITED prints
// belong only to the authenticated collector's private browser cart.
export function printCartBucket(editionType, userId) {
  if (editionType === 'OPEN') return 'guest'
  if (editionType === 'LIMITED' && userId) return 'collector'
  return null
}
export function limitedPrintStorageKey(userId) {
  if (!userId) throw new Error('collector_required')
  return 'jbu_limited_print_cart_v1:' + userId
}
