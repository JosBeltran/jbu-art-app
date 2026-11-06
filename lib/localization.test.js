import { test } from 'node:test'
import assert from 'node:assert/strict'
import { languageFromLocales, currencyFromLocales } from './localization.js'

test('Spanish in Mexico: Spanish and MXN', () => {
  assert.equal(languageFromLocales(['es-MX']), 'es')
  assert.equal(currencyFromLocales(['es-MX']), 'MXN')
})
test('English in United States: English and USD', () => {
  assert.equal(languageFromLocales(['en-US']), 'en')
  assert.equal(currencyFromLocales(['en-US']), 'USD')
})
test('Spanish in United States stays USD', () => {
  assert.equal(languageFromLocales(['es-US']), 'es')
  assert.equal(currencyFromLocales(['es-US']), 'USD')
})
test('English in Great Britain stays USD', () => {
  assert.equal(languageFromLocales(['en-GB']), 'en')
  assert.equal(currencyFromLocales(['en-GB']), 'USD')
})
test('Unsupported languages fall back to English and other regions to USD', () => {
  assert.equal(languageFromLocales(['fr-FR']), 'en')
  assert.equal(currencyFromLocales(['fr-FR']), 'USD')
})
test('First supported language in preference list is used independently of first region', () => {
  assert.equal(languageFromLocales(['fr-CA', 'es-MX']), 'es')
  assert.equal(currencyFromLocales(['fr-CA', 'es-MX']), 'USD')
})
test('No region and no locale use international fallback', () => {
  assert.equal(currencyFromLocales(['es']), 'USD')
  assert.equal(languageFromLocales([]), 'en')
  assert.equal(currencyFromLocales([]), 'USD')
})
