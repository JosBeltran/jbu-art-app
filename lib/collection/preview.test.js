import { describe, test, expect } from 'bun:test'
import { requirePreviewAdmin, collectorPreview, validProfileId, maskEmail } from './admin.server.js'
import { loadCollection, selectCompatibleArtworks } from './data.js'
const id = 'd6700fed-08c6-4434-9ebd-1c5bfb10bf24'
const request = new Request('https://example.com', { headers: { Authorization: 'Bearer test-token' } })
function db(rows = {}, errors = {}) {
  const calls = []
  return { calls,
    auth: { getUser: async () => ({ data: { user: { id } } }), admin: { getUserById: async () => ({ data: { user: { id, email: 'a@example.com' } } }) } },
    from(table) {
      const filters = []; const q = { then(resolve) { resolve({ data: rows[table] || [], error: errors[table] || null }) } }
      for (const method of ['select','eq','in','or','order']) q[method] = (...args) => { calls.push([table,method,...args]); if(method==='eq') filters.push(args); return q }
      q.maybeSingle = async () => ({ data: rows[table]?.[0] || null, error: errors[table] || null })
      return q
    },
  }
}
describe('Admin-only preview', () => {
  test('signed-out request never creates client', async () => {
    let made = false
    await expect(requirePreviewAdmin(new Request('https://example.com'), () => { made=true; return db() })).rejects.toMatchObject({ status: 401 })
    expect(made).toBe(false)
  })
  test('ordinary collector denied even if legacy profile says admin', async () => {
    await expect(requirePreviewAdmin(request, () => db({ profiles: [{ role: 'admin' }], user_roles: [] }))).rejects.toMatchObject({ status: 403 })
  })
  test('unverified auth token is denied', async () => {
    const client = db({ user_roles: [{role:'admin'}] }); client.auth.getUser = async () => ({ error: {}, data: {} })
    await expect(requirePreviewAdmin(request, () => client)).rejects.toMatchObject({ status: 401 })
  })
  test('missing separate role schema fails closed', async () => {
    await expect(requirePreviewAdmin(request, () => db({}, { user_roles: { code:'42P01' } }))).rejects.toMatchObject({ status: 503, code:'separate_roles_unavailable' })
  })
  test('verified separate admin role grants access', async () => {
    const client=db({ user_roles:[{role:'admin'}] })
    expect((await requirePreviewAdmin(request, () => client)).id).toBe(id)
    expect(client.calls).toContainEqual(['user_roles','eq','user_id',id])
  })
  test('service access never occurs before authorization', async () => {
    let service = false
    await expect(collectorPreview(request,id,{ authorize:async()=>{throw new Error('denied')},makeService:()=>{service=true;return db()} })).rejects.toThrow('denied')
    expect(service).toBe(false)
  })
  test('invalid target never becomes a query filter', () => {
    expect(validProfileId(id)).toBe(true)
    expect(validProfileId('x,current_owner_id.not.is.null')).toBe(false)
  })
})
describe('Shared read-only contract', () => {
  test('loads only target ownership, email orders and owner certificates', async () => {
    const client=db()
    await loadCollection(client,{id,email:'a@example.com'})
    expect(client.calls).toContainEqual(['artworks','or',`current_owner_id.eq.${id},pending_owner_id.eq.${id}`])
    expect(client.calls).toContainEqual(['orders','eq','buyer_email','a@example.com'])
    expect(client.calls).toContainEqual(['certificates','eq','owner_id',id])
  })
  test('read failures remain warnings rather than verified empty counts', async () => {
    const result=await loadCollection(db({}, { artworks:{code:'42501'} }),{id})
    expect(result.warnings).toContainEqual({section:'artworks',code:'42501'})
  })
  test('no claims tokens, admin notes, private provenance or storage paths selected', async () => {
    const client=db({ artworks:[{id:'a',pending_owner_id:id}], certificates:[{id:'c',claim_group_id:'g'}], order_items:[{id:'i',claim_group_id:'g'}] })
    await loadCollection(client,{id})
    const fields=client.calls.filter(c=>c[1]==='select').map(c=>c[2]).join(',')
    for(const field of ['*','claim_token','group_token','claim_notes','pdf_storage_path','owner_email_snapshot']) expect(fields).not.toContain(field)
    expect(client.calls.some(c=>c[0]==='artwork_provenance_public')).toBe(true)
    expect(client.calls.some(c=>c[0]==='provenance_events')).toBe(false)
  })
  test('Data Preview never reports RLS verified or changes Auth session', async () => {
    const client=db({ profiles:[{id,full_name:'Ana',email:'a@example.com'}] })
    const result=await collectorPreview(request,id,{authorize:async()=>{},makeService:()=>client})
    expect(result.readOnly).toBe(true)
    expect(result.diagnostics.permission).toEqual({status:'not_verified',reason:'requires_read_only_database_audit',counts:null})
    expect(result.collector.email).toBe('a***@example.com')
    expect(maskEmail('no-email')).toBe(null)
  })
  test('missing Auth association does not guess profile email for purchases', async () => {
    const client=db({profiles:[{id,email:'someone@example.com'}]})
    client.auth.admin.getUserById=async()=>({error:{},data:{}})
    const result=await collectorPreview(request,id,{authorize:async()=>{},makeService:()=>client})
    expect(result.diagnostics.authUserId).toBe(null)
    expect(result.diagnostics.warnings).toContainEqual({section:'identity',code:'auth_association_unverified'})
    expect(client.calls.some(c=>c[0]==='orders')).toBe(false)
  })
})

describe('Legacy optional artwork columns', () => {
  test('missing image_url retries with identical owner filter and returns owned artwork', async () => {
    const filters = []; const fieldsSeen = []
    const client = { from(table) {
      let fields = ''
      const q = { select(v) { fields = v; fieldsSeen.push(v); return q }, then(resolve) {
        resolve(table === 'artworks' && fields.split(',').includes('image_url')
          ? { error: { code: '42703', message: 'column artworks.image_url does not exist' } }
          : { data: table === 'artworks' ? [{id:'a', sku:'JBU-034', current_owner_id:id}] : [] })
      } }
      q.or = value => { filters.push(value); return q }
      for (const m of ['eq','in','order']) q[m] = () => q
      return q
    } }
    const result = await loadCollection(client, {id})
    expect(result.artworks.map(a=>a.sku)).toEqual(['JBU-034'])
    expect(filters).toEqual([`current_owner_id.eq.${id},pending_owner_id.eq.${id}`,`current_owner_id.eq.${id},pending_owner_id.eq.${id}`])
    expect(result.warnings).toEqual([])
  })
  test('access denial never retries or removes owner columns', async () => {
    let calls=0
    const result=await selectCompatibleArtworks(async()=>{calls++;return {error:{code:'42501',message:'permission denied'}}},'id,image_url,current_owner_id')
    expect(calls).toBe(1); expect(result.error.code).toBe('42501')
  })
  test('missing ownership column is not optional and never dropped', async () => {
    let calls=0
    await selectCompatibleArtworks(async()=>{calls++;return {error:{code:'42703',message:'column artworks.current_owner_id does not exist'}}},'id,current_owner_id')
    expect(calls).toBe(1)
  })
  test('nested favorite projection keeps explicit fields after optional image removal', async () => {
    const projections=[]
    const result=await selectCompatibleArtworks(async fields=>{projections.push(fields);return projections.length===1?{error:{code:'42703',message:'column artworks.image_url does not exist'}}:{data:[{id:'f'}]}},'id,artworks(id,sku,image_url,primary_image_url)')
    expect(projections[1]).toBe('id,artworks(id,sku,primary_image_url)')
    expect(result.data).toEqual([{id:'f'}])
  })
})
