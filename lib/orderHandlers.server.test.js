import { test, expect } from 'bun:test'
import { createOrderHandlers } from './orderHandlers.server.js'

const request = () => new Request('http://localhost/api/admin/orders', {
  method: 'PATCH', headers: { 'Content-Type': 'application/json' },
  body: JSON.stringify({ id: '82aee761-1d27-4124-83d8-97836be4f019', status: 'SHIPPED' }),
})
test('signed-out caller cannot list or update orders', async () => {
  const handlers = createOrderHandlers(async () => ({ error: 'auth_required', status: 401 }))
  expect((await handlers.GET(new Request('http://localhost/api/admin/orders'))).status).toBe(401)
  expect((await handlers.PATCH(request())).status).toBe(401)
})
test('ordinary authenticated caller cannot list or update other orders', async () => {
  const handlers = createOrderHandlers(async () => ({ error: 'forbidden', status: 403 }))
  expect((await handlers.GET(new Request('http://localhost/api/admin/orders'))).status).toBe(403)
  expect((await handlers.PATCH(request())).status).toBe(403)
})
test('unavailable separate roles cannot fall back to profile role or allow writes', async () => {
  const handlers = createOrderHandlers(async () => ({ error: 'admin_roles_unavailable', status: 503 }))
  const response = await handlers.PATCH(request())
  expect(response.status).toBe(503)
  expect((await response.json()).error).toBe('admin_roles_unavailable')
})
test('malformed order ID is rejected before database access', async () => {
  const handlers = createOrderHandlers(async () => ({ db: { from() { throw new Error('must not query') } } }))
  const response = await handlers.PATCH(new Request('http://localhost/api/admin/orders', {
    method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ id: 'invalid', status: 'SHIPPED' }),
  }))
  expect(response.status).toBe(400)
})