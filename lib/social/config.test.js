import { test, expect } from 'bun:test'
import { socialConfig, SOCIAL_FORMATS, socialFormat, socialPresentation, socialImageUrl, containSize } from './config.js'
import { shareMessage, whatsappUrl, linkedinUrl, artworkUrl } from '../share.js'

test('platform image formats use requested concrete sizes', () => {
 expect(SOCIAL_FORMATS.horizontal).toEqual({ width:1200,height:630 })
 expect(SOCIAL_FORMATS.pinterest).toEqual({ width:1000,height:1500 })
 expect(SOCIAL_FORMATS.instagram).toEqual({ width:1080,height:1350 })
})
test('portrait remains complete and proportional',()=>expect(containSize(1000,2000,800,600)).toEqual({width:300,height:600}))
test('landscape remains complete and proportional',()=>expect(containSize(2000,1000,800,600)).toEqual({width:800,height:400}))
test('square remains complete and proportional',()=>expect(containSize(1000,1000,800,600)).toEqual({width:600,height:600}))
test('panorama remains complete and proportional',()=>expect(containSize(4000,500,800,600)).toEqual({width:800,height:100}))
test('social payload excludes price regardless of sale state',()=>{
 const presentation=socialPresentation({title:'Work',base_price_mxn:45678,price:45678},socialConfig(),'Ana')
 expect(JSON.stringify(presentation)).not.toContain('45678')
 expect(shareMessage({title:'Work',price:45678,available:true})).not.toContain('45678')
 expect(decodeURIComponent(whatsappUrl({title:'Work',url:artworkUrl('JBU-001'),price:45678,available:true}))).not.toContain('45678')
})
test('disabled optimized format falls back without duplicate overrides',()=>{
 const config=socialConfig({pinterest:{enabled:false},artworkOverride:{title:'Bad'}})
 expect(socialFormat('pinterest',config)).toBe('horizontal')
 expect(config).not.toHaveProperty('artworkOverride')
 expect(config.pinterest.title).toBe(true)
})
test('image URLs keep canonical domain, SKU, language and revision',()=>{
 const url=new URL(socialImageUrl('JBU-001','pinterest','en-US','abc123'))
 expect(url.pathname).toBe('/social/artwork/JBU-001/pinterest')
 expect(url.searchParams.get('lang')).toBe('en')
 expect(url.searchParams.get('v')).toBe('abc123')
 expect(new URL(linkedinUrl(artworkUrl('JBU-001'))).searchParams.get('url')).toBe(artworkUrl('JBU-001'))
})
test('identity and English fields reuse existing global/profile fallbacks',()=>{
 expect(socialPresentation({sku:'JBU-001',title:'ES',title_en:'EN'},socialConfig(),'Ana','en').title).toBe('EN')
 expect(socialPresentation({sku:'JBU-001'},socialConfig({displayName:'Studio'}),'Ana').artist).toBe('Studio')
 expect(socialPresentation({sku:'JBU-001'},socialConfig(),'Ana').title).toBe('JBU-001')
})
