import { MAX_PRINT_SOURCE_BYTES, PRINT_MASTER_BUCKET, PRINT_SOURCE_TYPES } from './printAssetPresets.js'

export const PRINT_UPLOAD_CHUNK_BYTES = 6 * 1024 * 1024

export function printUploadError(error) {
  return new Error(Number(error?.statusCode || error?.status) === 413 ||
    ['EntityTooLarge', 'PayloadTooLarge'].includes(error?.code) ? 'source_too_large' : 'storage_failed')
}

export function printResumableEndpoint(projectUrl) {
  const url = new URL(projectUrl)
  if (/^[a-z0-9-]+\.supabase\.co$/.test(url.hostname))
    url.hostname = url.hostname.replace('.supabase.co', '.storage.supabase.co')
  url.pathname = '/storage/v1/upload/resumable'
  return url.href
}

// A single transfer retains its TUS URL across interrupted PATCH requests.
// HEAD reconciles the server offset, including lost responses to successful PATCHes.
export async function resumablePrintUpload(file, ticket, {
  projectUrl, onProgress = () => {}, fetchImpl = fetch,
  wait = ms => new Promise(resolve => setTimeout(resolve, ms)),
} = {}) {
  const endpoint = printResumableEndpoint(projectUrl)
  const headers = { 'Tus-Resumable': '1.0.0', 'x-signature': ticket.token }
  const check = response => {
    if (!response.ok) {
      const error = printUploadError({ status: response.status })
      error.retryable = response.status === 409 || response.status === 429 || response.status >= 500
      throw error
    }
    return response
  }
  const offsetOf = response => {
    const raw = response.headers.get('Upload-Offset')
    const value = raw === null ? NaN : Number(raw)
    if (!Number.isSafeInteger(value) || value < 0 || value > file.size) throw new Error('storage_failed')
    return value
  }
  const metadata = { bucketName: PRINT_MASTER_BUCKET, objectName: ticket.path, contentType: file.type, cacheControl: '3600' }
  let url
  let offset = 0
  let failures = 0
  onProgress(0)
  while (offset < file.size) {
    try {
      if (!url) {
        const response = check(await fetchImpl(endpoint, {
          method: 'POST', headers: { ...headers, 'Upload-Length': String(file.size),
            'Upload-Metadata': Object.entries(metadata).map(([key, value]) => key + ' ' + btoa(value)).join(',') },
          signal: AbortSignal.timeout(120000), redirect: 'error',
        }))
        const location = response.headers.get('Location')
        if (!location) throw new Error('storage_failed')
        const next = new URL(location, endpoint)
        // Never send a signed token to an unrelated host or route.
        if (next.origin !== new URL(endpoint).origin || !next.pathname.startsWith('/storage/v1/upload/resumable/'))
          throw new Error('storage_failed')
        url = next.href
      }
      if (failures) {
        offset = offsetOf(check(await fetchImpl(url, { method: 'HEAD', headers, signal: AbortSignal.timeout(30000), redirect: 'error' })))
        onProgress(Math.floor(offset / file.size * 100))
        if (offset === file.size) break
      }
      const end = Math.min(offset + PRINT_UPLOAD_CHUNK_BYTES, file.size)
      const response = check(await fetchImpl(url, {
        method: 'PATCH', headers: { ...headers, 'Content-Type': 'application/offset+octet-stream', 'Upload-Offset': String(offset) },
        body: file.slice(offset, end), signal: AbortSignal.timeout(120000), redirect: 'error',
      }))
      if (offsetOf(response) !== end) throw new Error('storage_failed')
      offset = end
      failures = 0
      onProgress(Math.floor(offset / file.size * 100))
    } catch (error) {
      if (error.retryable === false || ++failures > 4) throw error
      await wait([0, 1000, 3000, 5000][failures - 1])
    }
  }
}

// The application API handles only small JSON requests. File bytes go directly
// to the private bucket, and completion is checked before returning an upload ID.
export async function uploadPrintSource({ file, policy, request, storage, projectUrl, onProgress = () => {} }) {
  if (!file || !PRINT_SOURCE_TYPES.includes(file.type) || !file.size) throw new Error('invalid_upload')
  if (file.size > Math.min(MAX_PRINT_SOURCE_BYTES, policy?.maxBytes ?? MAX_PRINT_SOURCE_BYTES)) throw new Error('source_too_large')
  const uploadId = crypto.randomUUID()
  const input = { requestId: uploadId, type: file.type, bytes: file.size }
  onProgress(0)
  const ticket = await request({ ...input, action: 'upload' })
  if (file.size > PRINT_UPLOAD_CHUNK_BYTES) {
    await resumablePrintUpload(file, ticket, { projectUrl, onProgress })
  } else {
    const { error } = await storage.from(PRINT_MASTER_BUCKET)
      .uploadToSignedUrl(ticket.path, ticket.token, file, { contentType: file.type })
    if (error) throw printUploadError(error)
    onProgress(100)
  }
  await request({ ...input, action: 'upload_complete' })
  return uploadId
}

