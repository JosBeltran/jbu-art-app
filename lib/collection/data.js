// Shared read contract: both collector session and Admin expected-data preview.
// The caller owns authorization; this module never creates a privileged client.
export const ARTWORK_FIELDS = 'id,sku,title,title_en,medium,medium_en,technique,technique_en,primary_image_url,image_url,ownership_status,current_owner_id,pending_owner_id,certificate_hash,created_at'
export const CERTIFICATE_FIELDS = 'id,artwork_id,certificate_number,sku,status,issued_at,pdf_hash,claim_group_id'
export const ORDER_FIELDS = 'id,buyer_name,buyer_email,buyer_phone,shipping_address,status,total_amount_mxn,created_at'
export const FAVORITE_FIELDS = 'id,created_at,artworks(id,sku,title,title_en,primary_image_url,image_url,base_price_mxn,favorites_count)'

export async function loadCollection(db, identity) {
  const warnings = []
  async function read(section, query) {
    try {
      const { data, error } = await query
      if (error) { warnings.push({ section, code: error.code || 'query_failed' }); return [] }
      return data || []
    } catch { warnings.push({ section, code: 'request_failed' }); return [] }
  }
  const uid = identity.id
  const [artworks, orders, favorites, certificates] = await Promise.all([
    read('artworks', db.from('artworks').select(ARTWORK_FIELDS).or(`current_owner_id.eq.${uid},pending_owner_id.eq.${uid}`).order('created_at', { ascending: false })),
    identity.email ? read('orders', db.from('orders').select(ORDER_FIELDS).eq('buyer_email', identity.email).order('created_at', { ascending: false })) : Promise.resolve([]),
    read('favorites', db.from('artwork_favorites').select(FAVORITE_FIELDS).eq('user_id', uid).order('created_at', { ascending: false })),
    read('certificates', db.from('certificates').select(CERTIFICATE_FIELDS).eq('owner_id', uid).order('issued_at', { ascending: false })),
  ])
  const artworkIds = artworks.map(a => a.id)
  const orderIds = orders.map(o => o.id)
  // No tokens, administrative claim notes, internal provenance or immutable owner snapshots.
  const itemQueries = []
  if (artworkIds.length) itemQueries.push(read('claim_groups', db.from('order_items').select('id,artwork_id,claim_group_id,is_claimed').in('artwork_id', artworkIds)))
  if (orderIds.length) itemQueries.push(read('claim_groups', db.from('order_items').select('id,artwork_id,claim_group_id,is_claimed').in('order_id', orderIds)))
  const items = [...new Map((await Promise.all(itemQueries)).flat().map(i => [i.id, i])).values()]
  const groupIds = [...new Set([...items.map(i => i.claim_group_id), ...certificates.map(c => c.claim_group_id)].filter(Boolean))]
  const [groups, provenance] = await Promise.all([
    groupIds.length ? read('claim_groups', db.from('claim_groups').select('id,buyer_name,created_at').in('id', groupIds)) : Promise.resolve([]),
    artworkIds.length ? read('provenance', db.from('artwork_provenance_public').select('id,artwork_id,event_type,event_date,title,description,created_at').in('artwork_id', artworkIds).order('created_at', { ascending: true })) : Promise.resolve([]),
  ])
  return { artworks, orders, favorites: favorites.filter(f => f.artworks), certificates,
    pendingClaims: artworks.filter(a => a.pending_owner_id === uid),
    groups: groups.map(g => ({ ...g, items: items.filter(i => i.claim_group_id === g.id) })), provenance, warnings }
}
