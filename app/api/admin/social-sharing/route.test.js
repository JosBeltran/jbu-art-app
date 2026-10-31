import {test,expect,mock} from 'bun:test'
import {HttpError} from '../../../../lib/certificates/adminAuth.server.js'
let mode='unauthorized',writes=0
const db={from(){return {update(){writes++;return {eq(){return {select(){return {single:async()=>mode==='zero'?{data:null,error:null}:{data:{social_sharing:{displayName:'Studio'}},error:null}}}}}}}}}}
mock.module('@/lib/certificates/adminAuth.server',()=>({HttpError,requireCertificateAdmin:async ()=>{
 if(mode==='unauthorized')throw new HttpError(401,'unauthorized')
 if(mode==='forbidden')throw new HttpError(403,'forbidden')
 return {user:{id:'admin'}}
},serviceClient:()=>db}))
mock.module('server-only',()=>({}))
mock.module('next/cache',()=>({revalidateTag:()=>{}}))
const {PUT}=await import('./route.js')
const request=()=>new Request('http://localhost/api/admin/social-sharing',{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify({config:{displayName:'Studio'}})})
test('signed out cannot update settings',async()=>{mode='unauthorized';writes=0;expect((await PUT(request())).status).toBe(401);expect(writes).toBe(0)})
test('non-admin cannot update settings',async()=>{mode='forbidden';writes=0;expect((await PUT(request())).status).toBe(403);expect(writes).toBe(0)})
test('zero-row update never reports success',async()=>{mode='zero';expect((await PUT(request())).status).toBe(503)})
test('verified admin saves and reads back normalized settings',async()=>{mode='admin';const r=await PUT(request());expect(r.status).toBe(200);expect((await r.json()).config.displayName).toBe('Studio')})
