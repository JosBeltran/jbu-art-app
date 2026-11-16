'use client'
// Retain Phase 1 callers while sharing one presentation and policy resolver.
import ShippingBenefit from './ShippingBenefit'
export default function ShippingSummary(props) {
  return <ShippingBenefit {...props} />
}
