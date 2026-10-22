import { test, expect } from 'bun:test'

test('dry-run resolves linked artist without nonexistent artist column and never writes', async () => {
  const requests = []
  const server = Bun.serve({ port: 0, fetch(request) {
    requests.push({ method: request.method, url: new URL(request.url) })
    return Response.json([{ id: 'a1', sku: 'legacy-1', title: 'Obra', artist_profile_id: 'p1',
      artist_profile: { full_name: 'Josué Beltrán Uresti' }, ownership_status: 'VERIFIED',
      certificate_hash: 'legacy-hash', certificate_issued_at: '2026-10-22T17:00:00Z' }])
  } })
  try {
    const process = Bun.spawn([Bun.which('bun'), 'scripts/backfill-certificates.mjs'], {
      cwd: new URL('..', import.meta.url).pathname,
      env: { PATH: globalThis.process.env.PATH, NEXT_PUBLIC_SUPABASE_URL: server.url.origin,
        SUPABASE_SERVICE_ROLE_KEY: 'test-only-key' }, stdout: 'pipe', stderr: 'pipe',
    })
    const output = await new Response(process.stdout).text()
    const errors = await new Response(process.stderr).text()
    expect(await process.exited).toBe(0)
    expect(errors).toBe('')
    expect(output).toContain('[dry-run] legacy-1 COA-LEGACY-1 artist: Josué Beltrán Uresti')
    const summary = JSON.parse(output.trim().split('\n').at(-1))
    expect(summary).toEqual({ detected: 1, apply: false, created: 0, existing: 0, failed: 0 })
    expect(requests.length).toBe(1)
    expect(requests[0].method).toBe('GET')
    expect(requests[0].url.pathname).toBe('/rest/v1/artworks')
    expect(requests[0].url.searchParams.get('select')).toBe('*,artist_profile:profiles!artworks_artist_profile_id_fkey(full_name)')
  } finally { server.stop(true) }
})