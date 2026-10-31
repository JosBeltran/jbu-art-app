import { test, expect, mock } from 'bun:test'
import sharp from 'sharp'
import {socialConfig,socialPresentation} from './config.js'
mock.module('server-only',()=>({}))
const {renderSocialImage}=await import('./render.server.jsx')
const {allowedAssetUrl,preparedAsset}=await import('./assets.server.js')
test('only site images and configured public storage are allowed; reject private/network targets',()=>{
 expect(allowedAssetUrl('http://127.0.0.1/image')).toBeNull()
 expect(allowedAssetUrl('https://evil.test/image','https://project.supabase.co')).toBeNull()
 expect(allowedAssetUrl('https://project.supabase.co/storage/v1/object/private/file','https://project.supabase.co')).toBeNull()
 expect(allowedAssetUrl('https://project.supabase.co/storage/v1/object/public/artworks/a.jpg','https://project.supabase.co')?.hostname).toBe('project.supabase.co')
})
test('broken image does not throw and falls back to existing placeholder',async()=>{
 const a={title:'Work',sku:'JBU-001',primary_image_url:'https://evil.test/image'}
 const config=socialConfig();const bytes=await renderSocialImage(a,{config,presentation:socialPresentation(a,config)},'horizontal')
 const meta=await sharp(bytes).metadata();expect(meta.width).toBe(1200);expect(meta.height).toBe(630)
})
test('generated vertical formats retain requested sizes including branding',async()=>{
 const a={title:'Work',sku:'JBU-001'};const config=socialConfig()
 for(const [format,width,height] of [['pinterest',1000,1500],['instagram',1080,1350]]) {
  const bytes=await renderSocialImage(a,{config,presentation:socialPresentation(a,config)},format)
  const meta=await sharp(bytes).metadata();expect(meta.width).toBe(width);expect(meta.height).toBe(height)
 }
})
test('missing logo safely yields no asset',async()=>expect(await preparedAsset('https://evil.test/logo.png',50,50)).toBeNull())
