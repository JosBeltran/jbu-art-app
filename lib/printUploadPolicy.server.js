import { MAX_PRINT_SOURCE_BYTES, PRINT_MASTER_BUCKET, PRINT_SOURCE_TYPES } from './printAssetPresets.js'
import { PrintAssetError } from './printAssetLayout.js'

// Storage remains authoritative for the project's global limit. Mirror a lower
// configured global limit here when it cannot be read through the Storage SDK.
export async function printUploadPolicy(db, env = process.env) {
  const { data, error } = await db.storage.getBucket(PRINT_MASTER_BUCKET)
  if (error || !data || data.public !== false) throw new PrintAssetError('storage_failed', 503)
  const limits = [MAX_PRINT_SOURCE_BYTES]
  for (const raw of [data.file_size_limit, env.PRINT_MASTER_PROJECT_LIMIT_BYTES]) {
    if (raw == null || raw === '') continue
    const limit = Number(raw)
    if (!Number.isSafeInteger(limit) || limit < 1) throw new PrintAssetError('storage_failed', 503)
    limits.push(limit)
  }
  return { maxBytes: Math.min(...limits), types: PRINT_SOURCE_TYPES.filter(type =>
    !data.allowed_mime_types || data.allowed_mime_types.some(allowed =>
      allowed === type || allowed === 'image/*' || allowed === '*/*')) }
}

export function validatePrintUpload(input, policy) {
  if (!policy.types.includes(input.type) || !Number.isSafeInteger(input.bytes) || input.bytes < 1)
    throw new PrintAssetError('invalid_upload')
  if (input.bytes > policy.maxBytes)
    throw new PrintAssetError('source_too_large', 413, { maxBytes: policy.maxBytes })
}

export async function verifyPrintUpload(db, path, input, policy) {
  validatePrintUpload(input, policy)
  const { data, error } = await db.storage.from(PRINT_MASTER_BUCKET).info(path)
  if (error || !data || Number(data.size) !== input.bytes || data.contentType !== input.type)
    throw new PrintAssetError('upload_incomplete', 409)
}
