import { test } from 'node:test'
import assert from 'node:assert/strict'
import { MAX_PRINT_SOURCE_BYTES } from '../lib/printAssetPresets.js'
import { printUploadPolicy, validatePrintUpload, verifyPrintUpload } from '../lib/printUploadPolicy.server.js'
import { PRINT_UPLOAD_CHUNK_BYTES as chunk, resumablePrintUpload, uploadPrintSource } from '../lib/printSourceUpload.js'

const mb = 1024 * 1024
const file = bytes => new File([new Uint8Array(bytes)], 'master.jpg', { type: 'image/jpeg' })
const bucket = (overrides = {}) => ({ storage: { getBucket: async () => ({
  data: { public: false, file_size_limit: 50 * mb, allowed_mime_types: ['image/jpeg'], ...overrides },
}) } })
const response = (status, headers = {}) => new Response(null, { status, headers })

test('50 MB is accepted; 50 MB + 1 byte, empty and unsupported uploads are rejected', async () => {
  const policy = await printUploadPolicy(bucket(), {})
  assert.equal(policy.maxBytes, 50 * mb)
  for (const bytes of [25 * mb + 1, 40 * mb, MAX_PRINT_SOURCE_BYTES])
    assert.doesNotThrow(() => validatePrintUpload({ bytes, type: 'image/jpeg' }, policy))
  assert.throws(() => validatePrintUpload({ bytes: MAX_PRINT_SOURCE_BYTES + 1, type: 'image/jpeg' }, policy), /source_too_large/)
  assert.throws(() => validatePrintUpload({ bytes: 0, type: 'image/jpeg' }, policy), /invalid_upload/)
  assert.throws(() => validatePrintUpload({ bytes: 1, type: 'image/png' }, policy), /invalid_upload/)
})

test('effective policy respects lower bucket and configured project limits', async () => {
  assert.equal((await printUploadPolicy(bucket({ file_size_limit: 20 * mb }), {})).maxBytes, 20 * mb)
  assert.equal((await printUploadPolicy(bucket(), { PRINT_MASTER_PROJECT_LIMIT_BYTES: String(15 * mb) })).maxBytes, 15 * mb)
  assert.equal((await printUploadPolicy(bucket({ file_size_limit: null }), {})).maxBytes, 50 * mb)
  await assert.rejects(printUploadPolicy(bucket({ public: true }), {}), /storage_failed/)
  await assert.rejects(printUploadPolicy(bucket(), { PRINT_MASTER_PROJECT_LIMIT_BYTES: 'bad' }), /storage_failed/)
})

test('completion requires actual Storage size and content type, not client success', async () => {
  const policy = await printUploadPolicy(bucket(), {})
  const input = { bytes: 40 * mb, type: 'image/jpeg' }
  const db = data => ({ storage: { from: () => ({ info: async () => ({ data }) }) } })
  await assert.rejects(verifyPrintUpload(db(null), 'staging/path', input, policy), /upload_incomplete/)
  await assert.rejects(verifyPrintUpload(db({ size: 10, contentType: 'image/jpeg' }), 'staging/path', input, policy), /upload_incomplete/)
  await assert.rejects(verifyPrintUpload(db({ size: input.bytes, contentType: 'image/png' }), 'staging/path', input, policy), /upload_incomplete/)
  await verifyPrintUpload(db({ size: input.bytes, contentType: input.type }), 'staging/path', input, policy)
})

test('large uploads use bounded TUS chunks and reach 100 only after the last acknowledgement', async () => {
  const source = file(50 * mb)
  let offset = 0
  const progress = []
  const calls = []
  await resumablePrintUpload(source, { path: 'staging/parent/admin/request/source', token: 'scoped-token' }, {
    projectUrl: 'https://project.supabase.co', onProgress: n => progress.push(n),
    fetchImpl: async (url, options) => {
      calls.push(options.method)
      assert.equal(new URL(url).hostname, 'project.storage.supabase.co')
      assert.equal(options.headers['x-signature'], 'scoped-token')
      if (options.method === 'POST') {
        assert.equal(options.headers['Upload-Length'], String(source.size))
        return response(201, { Location: url + '/transfer' })
      }
      assert.equal(Number(options.headers['Upload-Offset']), offset)
      assert.ok(options.body.size <= chunk)
      offset += options.body.size
      return response(204, { 'Upload-Offset': String(offset) })
    },
  })
  assert.equal(offset, source.size)
  assert.equal(calls.filter(method => method === 'POST').length, 1)
  assert.equal(calls.filter(method => method === 'PATCH').length, 9)
  assert.equal(progress.at(-1), 100)
  assert.ok(progress.slice(0, -1).every(n => n < 100))
})

test('lost PATCH response resumes from server offset without retransmitting acknowledged bytes', async () => {
  const source = file(26 * mb)
  let offset = 0
  let interrupted = false
  const starts = []
  await resumablePrintUpload(source, { path: 'staging/path', token: 'token' }, {
    projectUrl: 'https://project.supabase.co', wait: async () => {},
    fetchImpl: async (url, options) => {
      if (options.method === 'POST') return response(201, { Location: url + '/transfer' })
      if (options.method === 'HEAD') return response(200, { 'Upload-Offset': String(offset) })
      starts.push(Number(options.headers['Upload-Offset']))
      offset += options.body.size
      if (!interrupted) { interrupted = true; throw new TypeError('network disconnected') }
      return response(204, { 'Upload-Offset': String(offset) })
    },
  })
  assert.deepEqual(starts, [0, chunk, 2 * chunk, 3 * chunk, 4 * chunk])
  assert.equal(offset, source.size)
})

test('project 413 fails without retry or completion', async () => {
  let calls = 0
  await assert.rejects(resumablePrintUpload(file(26 * mb), { path: 'staging/path', token: 'token' }, {
    projectUrl: 'https://project.supabase.co', wait: async () => {},
    fetchImpl: async () => { calls++; return response(413) },
  }), /source_too_large/)
  assert.equal(calls, 1)
})

test('signed token cannot be redirected to another origin', async () => {
  let calls = 0
  await assert.rejects(resumablePrintUpload(file(26 * mb), { path: 'staging/path', token: 'token' }, {
    projectUrl: 'https://project.supabase.co', wait: async () => {},
    fetchImpl: async () => { calls++; return response(201, { Location: 'https://untrusted.example/storage/v1/upload/resumable/id' }) },
  }), /storage_failed/)
  assert.equal(calls, 5)
})

test('small uploads reuse signed direct upload and return ID only after verification', async () => {
  const sequence = []
  const id = await uploadPrintSource({
    file: file(mb), policy: { maxBytes: 50 * mb },
    request: async body => {
      sequence.push(body.action)
      return { path: 'staging/path', token: 'token' }
    },
    storage: { from: name => {
      assert.equal(name, 'print-masters')
      return { uploadToSignedUrl: async () => { sequence.push('bytes'); return {} } }
    } },
  })
  assert.match(id, /^[a-f0-9-]{36}$/)
  assert.deepEqual(sequence, ['upload', 'bytes', 'upload_complete'])
})

test('failed or incomplete uploads never return a usable ID', async () => {
  for (const failure of ['transfer', 'verification']) {
    const sequence = []
    await assert.rejects(uploadPrintSource({
      file: file(mb),
      request: async body => {
        sequence.push(body.action)
        if (body.action === 'upload_complete') throw new Error('upload_incomplete')
        return { path: 'staging/path', token: 'token' }
      },
      storage: { from: () => ({ uploadToSignedUrl: async () =>
        failure === 'transfer' ? { error: { statusCode: 500 } } : {} }) },
    }), failure === 'transfer' ? /storage_failed/ : /upload_incomplete/)
    assert.deepEqual(sequence, failure === 'transfer' ? ['upload'] : ['upload', 'upload_complete'])
  }
})

test('oversized files fail before signing or any file transfer', async () => {
  await assert.rejects(uploadPrintSource({
    file: file(26 * mb), policy: { maxBytes: 20 * mb },
    request: async () => { assert.fail('must not sign') },
  }), /source_too_large/)
})

test('40 MB orchestration transfers directly then verifies before returning to preparation', async t => {
  const sequence = []
  let offset = 0
  t.mock.method(globalThis, 'fetch', async (url, options) => {
    assert.equal(new URL(url).hostname, 'project.storage.supabase.co')
    sequence.push(options.method)
    if (options.method === 'POST') return response(201, { Location: url + '/transfer' })
    offset += options.body.size
    return response(204, { 'Upload-Offset': String(offset) })
  })
  const id = await uploadPrintSource({
    file: file(40 * mb), projectUrl: 'https://project.supabase.co',
    storage: { from: () => { assert.fail('large file must use TUS') } },
    request: async body => {
      sequence.push(body.action)
      if (body.action === 'upload_complete') assert.equal(offset, 40 * mb)
      return { path: 'staging/path', token: 'token' }
    },
  })
  assert.ok(id)
  assert.equal(sequence[0], 'upload')
  assert.equal(sequence.at(-1), 'upload_complete')
  assert.equal(sequence.filter(value => value === 'PATCH').length, 7)
})

