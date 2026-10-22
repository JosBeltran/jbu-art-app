import { test, expect, mock } from 'bun:test'

let role = 'user'
let roleError = null
let authError = null
let privilegedClients = 0
const scoped = {
  auth: { getUser: async () => ({ data: { user: { id: 'verified-user' } }, error: authError }) },
  from(table) {
    expect(table).toBe('user_roles')
    return { select() { return this }, async eq(field, value) {
      expect(field).toBe('user_id'); expect(value).toBe('verified-user')
      return { data: [{ role }], error: roleError }
    } }
  },
}
mock.module('@supabase/supabase-js', () => ({ createClient(url, key) {
  if (key === 'test-server-key') { privilegedClients++; return { privileged: true } }
  return scoped
} }))
const { authorizeOrderAdmin } = await import('./adminOrders.server.js')
process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://example.test'
process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'test-public-key'
process.env.SUPABASE_SERVICE_ROLE_KEY = 'test-server-key'
const req = (token = 'test-session') => new Request('http://localhost/api/admin/orders', { headers: token ? { Authorization: `Bearer ${token}` } : {} })

test('missing bearer session never creates a privileged client', async () => {
  privilegedClients = 0
  expect((await authorizeOrderAdmin(req(''))).status).toBe(401)
  expect(privilegedClients).toBe(0)
})
test('invalid session is rejected before checking roles', async () => {
  authError = { message: 'invalid' }; privilegedClients = 0
  try {
    expect((await authorizeOrderAdmin(req())).status).toBe(401)
    expect(privilegedClients).toBe(0)
  } finally { authError = null }
})
test('ordinary user role cannot create privileged client', async () => {
  role = 'user'; privilegedClients = 0
  expect((await authorizeOrderAdmin(req())).status).toBe(403)
  expect(privilegedClients).toBe(0)
})
test('verified separate admin role permits privileged work', async () => {
  role = 'admin'; privilegedClients = 0
  expect((await authorizeOrderAdmin(req())).db).toEqual({ privileged: true })
  expect(privilegedClients).toBe(1)
})
test('failed roles lookup fails closed', async () => {
  role = 'admin'; roleError = { code: '42P01' }; privilegedClients = 0
  const log = console.error; console.error = () => {}
  try {
    expect((await authorizeOrderAdmin(req())).status).toBe(503)
    expect(privilegedClients).toBe(0)
  } finally { roleError = null; console.error = log }
})