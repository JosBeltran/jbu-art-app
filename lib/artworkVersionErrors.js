export function artworkVersionDatabaseError(error) {
  const message = error?.message
  const code = error?.code
  if (message === 'artwork_not_found') return { status: 404, code: message }
  if (['invalid_version', 'version_image_required', 'version_price_required', 'invalid_version_event'].includes(message))
    return { status: 400, code: message }
  if (['version_id_conflict', 'invalid_version_predecessor', 'version_predecessor_locked', 'version_parent_unpublished'].includes(message))
    return { status: 409, code: message }
  if (code === '23505') return {
    status: 409,
    code: message?.includes('"artwork_single_successor"') ? 'successor_exists' : 'version_record_conflict',
  }
  if (code === 'PGRST202' || code === '42883') return { status: 503, code: 'version_function_missing' }
  if (code === '42501') return { status: 503, code: 'version_database_permission' }
  if (['23502', '23503', '23514', '22001', '42703', 'PGRST204'].includes(code))
    return { status: 503, code: 'version_database_constraint' }
  return { status: 503, code: 'versions_unavailable' }
}
