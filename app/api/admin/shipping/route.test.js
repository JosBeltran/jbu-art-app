import { test, expect, mock } from 'bun:test'
import { HttpError } from '../../../../lib/certificates/adminAuth.server.js'
let mode = 'unauthorized',
  writes = 0
const id = '10000000-0000-4000-8000-000000000001'
const db = {
  from(table) {
    let mutation = false
    return {
      select() {
        return this
      },
      eq() {
        return this
      },
      update() {
        mutation = true
        writes++
        return this
      },
      order: async () => ({ data: [{ id, active: true }] }),
      single: async () =>
        mode === 'zero' && mutation
          ? { data: null }
          : {
              data:
                table === 'site_settings'
                  ? {
                      id: true,
                      global_shipping_countries: ['MX'],
                      default_shipping_policies: {},
                      shipping_revision: 1,
                    }
                  : { id },
            },
    }
  },
}
mock.module('@/lib/certificates/adminAuth.server', () => ({
  HttpError,
  serviceClient: () => db,
  requireCertificateAdmin: async () => {
    if (mode === 'unauthorized') throw new HttpError(401, 'unauthorized')
    if (mode === 'forbidden') throw new HttpError(403, 'forbidden')
    return { user: { id: 'admin' } }
  },
}))
const { GET, PUT, POST } = await import('./route.js')
const request = (body) =>
  new Request('https://example.test/api/admin/shipping', {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  })
const settings = {
  action: 'settings',
  globalCountries: ['MX', 'SE'],
  defaults: {},
}
test('every admin action rejects missing authentication before reads or writes', async () => {
  mode = 'unauthorized'
  writes = 0
  for (const action of [GET, PUT, POST])
    expect((await action(request(settings))).status).toBe(401)
  expect(writes).toBe(0)
})
test('verified non-admin cannot mutate or preview shipping', async () => {
  mode = 'forbidden'
  writes = 0
  for (const action of [GET, PUT, POST])
    expect((await action(request(settings))).status).toBe(403)
  expect(writes).toBe(0)
})
test('invalid country and unknown policy assignment are rejected before writes', async () => {
  mode = 'admin'
  writes = 0
  expect(
    (await PUT(request({ ...settings, globalCountries: ['ZZ'] }))).status
  ).toBe(400)
  expect(
    (
      await PUT(
        request({
          ...settings,
          defaults: { open_print: ['10000000-0000-4000-8000-000000000099'] },
        })
      )
    ).status
  ).toBe(400)
  expect(writes).toBe(0)
})
test('zero-row save fails and a verified admin save reads back persisted state', async () => {
  mode = 'zero'
  expect((await PUT(request(settings))).status).toBe(503)
  mode = 'admin'
  const result = await PUT(request(settings))
  expect(result.status).toBe(200)
  expect((await result.json()).globalCountries).toEqual(['MX'])
})
