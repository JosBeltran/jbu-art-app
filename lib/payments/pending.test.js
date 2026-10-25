import test from 'node:test'
import assert from 'node:assert/strict'
import {paymentFrom,paymentState,phase,offerIdentity} from './pending.js'
const now=Date.parse('2026-11-02T12:00:00Z'),due='2026-11-02T13:00:00Z'
const offer={id:'o',status:'ACCEPTED',user_id:'buyer',offer_amount_mxn:8500,payment_status:'PENDING',payment_due_at:due}
const auction={id:'a',status:'SOLD',sale_type:'BID',winner_id:'buyer',winning_amount:12345,current_bid:1,payment_status:'PENDING',payment_due_at:due}
test('offer price comes from accepted amount',()=>assert.equal(paymentFrom('OFFER',offer).amount,8500))
test('auction price comes from winning bid',()=>assert.equal(paymentFrom('AUCTION',auction).amount,12345))
test('both origins use same pending entitlement',()=>{for(const [s,r]of[['OFFER',offer],['AUCTION',auction]])assert.equal(paymentState(paymentFrom(s,r),'buyer',now),'PENDING')})
test('wrong buyer cannot pay',()=>assert.equal(paymentState(paymentFrom('OFFER',offer),'intruder',now),'NONE'))
test('exact deadline is expired',()=>assert.equal(paymentState(paymentFrom('AUCTION',{...auction,payment_due_at:new Date(now).toISOString()}),'buyer',now),'EXPIRED'))
test('explicit expired payment blocks future deadline',()=>assert.equal(paymentState(paymentFrom('OFFER',{...offer,payment_status:'EXPIRED'}),'buyer',now),'EXPIRED'))
test('paid purchase has no pending CTA',()=>assert.equal(paymentState(paymentFrom('OFFER',{...offer,payment_status:'PAID'}),'buyer',now),'PAID'))
test('missing deadline fails closed',()=>assert.equal(paymentState(paymentFrom('AUCTION',{...auction,payment_due_at:null}),'buyer',now),'NONE'))
test('rejected offers confer no right',()=>assert.equal(paymentFrom('OFFER',{...offer,status:'REJECTED'}),null))
test('stale live auction ends at close',()=>assert.equal(phase({status:'LIVE',ends_at:new Date(now).toISOString()},now),'ENDED'))
test('guest identity cannot use caller UUID',()=>assert.deepEqual(offerIdentity(null,'Guest@Example.test'),{user_id:null,guest_email:'guest@example.test'}))
