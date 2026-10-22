// Reclamación por lote: 1 obra = 1 reclamación = 1 certificado, compartiendo claim_group_id.
// Sin precios ni datos comerciales en la respuesta.
import { HttpError } from './adminAuth.server.js'
import { batchItemState } from './public.js'

async function loadGroup(db, token) {
  const clean = String(token || '').trim()
  if (!clean || clean.length > 200) throw new HttpError(400, 'invalid_token')
  const { data: group, error } = await db.from('claim_groups').select('id, buyer_name').eq('group_token', clean).maybeSingle()
  if (error) throw new HttpError(503, 'claim_groups_unavailable')
  if (!group) throw new HttpError(404, 'group_not_found')
  return group
}

async function loadRows(db, group) {
  const { data: items, error } = await db.from('order_items').select('id, artwork_id, sku_snapshot, title_snapshot, is_claimed').eq('claim_group_id', group.id)
  if (error) throw new HttpError(503, 'order_items_unavailable')
  const ids = [...new Set((items || []).map((i) => i.artwork_id).filter(Boolean))]
  let artworks = []
  let certificates = []
  if (ids.length) {
    const rel = await db.from('artworks').select('*, artist_profile:profiles!artworks_artist_profile_id_fkey(full_name)').in('id', ids)
    artworks = rel.error ? (await db.from('artworks').select('*').in('id', ids)).data || [] : rel.data || []
    const certs = await db.from('certificates').select('artwork_id, status').in('artwork_id', ids).eq('status', 'ISSUED')
    certificates = certs.error ? [] : certs.data || []
  }
  const byId = new Map(artworks.map((a) => [a.id, a]))
  const certBy = new Map(certificates.map((c) => [c.artwork_id, c]))
  return (items || []).map((item) => ({ item, artwork: byId.get(item.artwork_id) || null, certificate: certBy.get(item.artwork_id) || null }))
}

const profileName = (a) => { const r = a?.artist_profile; const p = Array.isArray(r) ? r[0] : r; return p?.full_name || null }

/** Vista pública del lote: imagen, título, SKU, artista, año y estado. */
export function presentBatchItem({ item, artwork, certificate }) {
  return {
    id: item.id,
    sku: artwork?.sku || item.sku_snapshot || null,
    title: artwork?.title || item.title_snapshot || null,
    artist: profileName(artwork),
    year: artwork?.year ?? null,
    image: artwork?.primary_image_url || artwork?.image_url || (Array.isArray(artwork?.images) ? artwork.images[0] : null) || null,
    state: artwork ? batchItemState({ artwork, certificate, item }) : 'UNAVAILABLE',
  }
}

export async function loadBatch(db, token) {
  const group = await loadGroup(db, token)
  const rows = await loadRows(db, group)
  return { group: { buyer_name: group.buyer_name || null }, items: rows.map(presentBatchItem) }
}

/** Crea una reclamación pendiente por obra seleccionada; cada una se aprueba y certifica por separado. */
export async function claimBatch(db, { token, userId, itemIds, recordProvenance = true }) {
  const group = await loadGroup(db, token)
  const wanted = new Set(Array.isArray(itemIds) ? itemIds.map(String) : [])
  if (!wanted.size) throw new HttpError(400, 'no_items')
  const rows = (await loadRows(db, group)).filter((r) => wanted.has(String(r.item.id)))
  if (rows.length !== wanted.size) throw new HttpError(400, 'item_not_in_group')
  const results = []
  for (const row of rows) {
    const state = row.artwork ? batchItemState(row) : 'UNAVAILABLE'
    if (state !== 'AVAILABLE') { results.push({ id: row.item.id, status: 'skipped', state }); continue }
    const now = new Date().toISOString()
    const { data: updated, error } = await db.from('artworks').update({
      pending_owner_id: userId, ownership_status: 'CLAIM_PENDING', pending_claim_source: 'BATCH_CLAIM',
      pending_claim_group_id: group.id, updated_at: now,
    }).eq('id', row.artwork.id).is('pending_owner_id', null).not('ownership_status', 'in', '(CLAIM_PENDING,CLAIMED,VERIFIED)').select('id')
    if (error) {
      if (/pending_claim_/.test(String(error.message))) throw new HttpError(503, 'certificates_migration_missing')
      results.push({ id: row.item.id, status: 'failed' }); continue
    }
    // Cero filas actualizadas nunca cuenta como éxito (otra reclamación ganó la carrera).
    if (!updated?.length) { results.push({ id: row.item.id, status: 'skipped', state: 'CLAIM_PENDING' }); continue }
    await db.from('order_items').update({ is_claimed: true, claimed_by_user_id: userId, claimed_at: now }).eq('id', row.item.id)
    if (recordProvenance) {
      await db.rpc('record_provenance', {
        _artwork: row.artwork.id, _type: 'CLAIM_CREATED', _title: 'Ownership claim submitted',
        _description: 'A collector submitted an ownership claim as part of a collection registration.',
        _event_date: now.slice(0, 10), _precision: 'DAY', _reference_type: 'CLAIM_GROUP', _reference_id: group.id,
        _dedupe: `CLAIM_CREATED:${row.artwork.id}:${userId}:${group.id}`, _visibility: 'PRIVATE',
        _metadata: { claim_source: 'BATCH_CLAIM', claim_group_id: group.id }, _source: 'SYSTEM',
      }).then(() => null, () => null)
    }
    results.push({ id: row.item.id, status: 'claimed', state: 'CLAIM_PENDING' })
  }
  return { results }
}
