import { test } from 'node:test'
import assert from 'node:assert/strict'
import {
  marketFromCookies,
  marketCurrency,
  browsingCountry,
  checkoutDestination,
  cookieValue,
} from './market.js'
import { productBenefits, shippingBenefitLabel } from './purchaseBenefits.js'
import { localPurchaseCapabilities } from './localDelivery.js'
const t = (es, en) => en

test('market cookies are separate from language/currency and ignore invalid or fabricated destinations', () => {
  assert.equal(
    marketFromCookies('jbu-lang=en; jbu-market=SE; jbu-currency=USD'),
    'SE'
  )
  for (const value of ['ALL', 'ZZ', '<script>', '%E0%A4%A'])
    assert.equal(marketFromCookies('jbu-market=' + value), null)
  assert.equal(
    cookieValue('other-jbu-market=US; jbu-market=MX', 'jbu-market'),
    'MX'
  )
  assert.equal(marketCurrency('MX'), 'MXN')
  assert.equal(marketCurrency('SE'), 'USD')
  assert.equal(marketCurrency(null), null)
})
test('catalog URLs can browse All Countries without erasing the purchase market', () => {
  assert.equal(browsingCountry(undefined, 'SE'), 'SE')
  assert.equal(browsingCountry('ALL', 'SE'), null)
  assert.equal(browsingCountry('GB', 'SE'), 'GB')
  assert.equal(checkoutDestination({}, 'jbu-market=SE'), 'SE')
  assert.equal(
    checkoutDestination({ destination: 'mx' }, 'jbu-market=SE'),
    'MX'
  )
})
test('benefits reflect actual product capabilities rather than inferring certificates or hand embellishment', () => {
  assert.deepEqual(productBenefits({ type: 'ORIGINAL' }), [
    'certificate',
    'provenance',
    'shipping',
    'secure',
  ])
  const open = productBenefits({
    type: 'PRINT',
    edition_type: 'OPEN',
    paper_type: 'Cotton rag',
  })
  assert.equal(open.includes('certificate'), false)
  assert.equal(open.includes('provenance'), false)
  assert.equal(open.includes('specifications'), true)
  const limited = productBenefits({ type: 'PRINT', edition_type: 'LIMITED' })
  assert.equal(limited.includes('limited'), true)
  assert.equal(limited.includes('embellished'), false)
  assert.equal(
    productBenefits({
      type: 'PRINT',
      edition_type: 'LIMITED',
      is_hand_embellished: true,
      is_signed: true,
      is_numbered: true,
    }).includes('signed'),
    true
  )
  assert.deepEqual(productBenefits({ type: 'DIGITAL_DOWNLOAD' }), [
    'digital',
    'secure',
  ])
})
test('included shipping has no redundant zero and fixed rates preserve the transaction currency', () => {
  assert.equal(
    shippingBenefitLabel(
      { method: 'INCLUDED', amount: 0, currency: 'mxn' },
      t,
      'en'
    ),
    'Shipping included'
  )
  assert.equal(
    shippingBenefitLabel(
      { method: 'FIXED_RATE', amount: 35000, currency: 'mxn' },
      t,
      'en'
    ),
    'Shipping: $350 MXN'
  )
  assert.equal(
    shippingBenefitLabel(
      { method: 'FIXED_RATE', amount: 1800, currency: 'usd' },
      t,
      'en'
    ),
    'Shipping: $18 USD'
  )
  assert.equal(
    shippingBenefitLabel(
      { method: 'BUYER_ARRANGED', amount: 0, currency: 'mxn' },
      t,
      'en'
    ),
    'Arrange your own shipping'
  )
})
const item = { type: 'ORIGINAL', delivery_category: 'standard' }
const shipping = {
  countries: ['MX'],
  options: [{ method:'INCLUDED',amount:0,groups: [{ policy: { fulfillment_provider: 'ARTIST' } }] }],
}
test('local delivery and payment on delivery are independent, restricted capabilities', () => {
  const base = {
    item,
    market: 'MX',
    shipping,
    config: { enabled: true, paymentOnDeliveryEnabled: false },
  }
  assert.deepEqual(localPurchaseCapabilities(base), {
    localDelivery: true,
    paymentOnDelivery: false,
  })
  assert.equal(
    localPurchaseCapabilities({
      ...base,
      config: { enabled: true, paymentOnDeliveryEnabled: true },
    }).paymentOnDelivery,
    true
  )
  for (const change of [
    { market: 'SE' },
    { market: null },
    { item: { ...item, type: 'DIGITAL' } },
    { item: { ...item, type: 'PRINT' } },
    { item: { ...item, delivery_category: null } },
    { config: { enabled: false } },
    {
      shipping: {
        countries: ['MX'],
        options: [
          { groups: [{ policy: { fulfillment_provider: 'PRODIGI' } }] },
        ],
      },
    },
  ])
    assert.deepEqual(localPurchaseCapabilities({ ...base, ...change }), {
      localDelivery: false,
      paymentOnDelivery: false,
    })
})


test('paid local delivery never reuses the fee-less pay-on-delivery order path',()=>{
 const charged={countries:['MX'],options:[{method:'LOCAL_DELIVERY',amount:35000,groups:[{policy:{fulfillment_provider:'ARTIST'}}]}]}
 assert.deepEqual(localPurchaseCapabilities({item,market:'MX',shipping:charged,config:{enabled:true,paymentOnDeliveryEnabled:true}}),{localDelivery:true,paymentOnDelivery:false})
 const carrier={...charged,options:[{...charged.options[0],method:'FIXED_RATE'}]}
 assert.deepEqual(localPurchaseCapabilities({item,market:'MX',shipping:carrier,config:{enabled:true,paymentOnDeliveryEnabled:true}}),{localDelivery:false,paymentOnDelivery:false})
})
