import test from 'node:test'
import assert from 'node:assert/strict'
import {deliveryAddress,deliveryIds} from './localDeliveryInput.js'
const address={recipient:'Buyer',phone:'8181234567',street:'Calle',exterior:'12',neighborhood:'Centro',postal_code:'64000',municipality:'Monterrey',state:'Nuevo León'}
test('full delivery address required; interior optional',()=>{assert.equal(deliveryAddress(address).line1,'Calle 12');assert.throws(()=>deliveryAddress({...address,exterior:''}),/address_incomplete/);assert.throws(()=>deliveryAddress({...address,postal_code:'1'}),/address_invalid/)})
test('buyer cannot select delivery classification or send prints/duplicate originals',()=>{const id='10000000-0000-4000-8000-000000000001';assert.deepEqual(deliveryIds([{id,type:'ORIGINAL',delivery_category:'standard'}]),[id]);assert.throws(()=>deliveryIds([{id,type:'PRINT'}]),/originals_only/);assert.throws(()=>deliveryIds([{id},{id}]),/invalid_items/)})
