import { test } from 'node:test'
import assert from 'node:assert/strict'
import { signupConsent, hasCurrentLegalConsent, isGoogleUser } from './legalConsent.js'
import { parseCookieConsent, cookieChoice } from './cookieConsent.js'
test('email signup rejects unchecked consent', () => { assert.throws(() => signupConsent(false)); assert.throws(() => signupConsent('true')) })
test('email acceptance carries versions 1.0', () => { assert.deepEqual(signupConsent(true), { accepted: true, terms_version: '1.0', privacy_version: '1.0' }) })
const row = { terms_accepted_at: '2026-10-26T00:00:00Z', privacy_accepted_at: '2026-10-26T00:00:00Z', terms_version: '1.0', privacy_version: '1.0' }
test('returning Google acceptance is valid only for both current versions', () => { assert.equal(hasCurrentLegalConsent(row), true); assert.equal(hasCurrentLegalConsent({...row,privacy_version:'0.9'}), false); assert.equal(hasCurrentLegalConsent({...row,terms_version:'0.9'}), false); assert.equal(hasCurrentLegalConsent(null), false); assert.equal(hasCurrentLegalConsent({...row,privacy_accepted_at:null}), false) })
test('Google identities include linked provider accounts', () => { assert.equal(isGoogleUser({app_metadata:{providers:['email','google']}}), true); assert.equal(isGoogleUser({app_metadata:{provider:'email'}}), false) })
test('necessary cookies stay on while optional defaults are off', () => { const choice=cookieChoice(false,false); assert.equal(choice.necessary,true); assert.equal(choice.analytics,false); assert.equal(choice.marketing,false) })
test('accept all records version and date', () => { const choice=cookieChoice(true,true,'2026-10-26T00:00:00Z'); assert.equal(choice.analytics,true); assert.equal(choice.marketing,true); assert.equal(choice.version,'1.0'); assert.equal(choice.updated_at,'2026-10-26T00:00:00Z') })
test('invalid or previous version cannot enable optional technologies', () => { assert.equal(parseCookieConsent('bad'),null); assert.equal(parseCookieConsent({...cookieChoice(true,true),version:'0.9'}),null); assert.equal(parseCookieConsent({...cookieChoice(true,true),necessary:false}),null) })
test('withdrawal remains a persisted refusal, not absent choice', () => { const saved=parseCookieConsent(JSON.stringify(cookieChoice(false,false))); assert.equal(saved.analytics,false); assert.equal(saved.marketing,false); assert.equal(saved.necessary,true) })
