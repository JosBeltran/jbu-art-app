/** Verify the signed/retrieved Stripe shipping choice against its frozen server manifest. */
export function validateShippingPayment(session, checkout, rate) {
  if (
    !checkout ||
    checkout.stripe_session_id !== session.id ||
    checkout.id !== session.metadata?.jbu_shipping_checkout
  )
    throw new Error('shipping_checkout_binding_mismatch')
  if (
    rate?.metadata?.jbu_shipping_checkout !== checkout.id ||
    !/^\d$/.test(rate?.metadata?.jbu_shipping_option || '')
  )
    throw new Error('shipping_rate_mismatch')
  const option = checkout.options[Number(rate.metadata.jbu_shipping_option)]
  const address =
    session.collected_information?.shipping_details?.address ||
    session.shipping_details?.address
  if (
    !option ||
    !address?.country ||
    !checkout.countries.includes(address.country)
  )
    throw new Error('shipping_destination_mismatch')
  const amount = session.total_details?.amount_shipping
  if (
    !Number.isSafeInteger(amount) ||
    amount < 0 ||
    amount !== option.amount ||
    rate.fixed_amount?.amount !== amount ||
    rate.fixed_amount?.currency !== option.currency ||
    session.currency !== option.currency ||
    session.shipping_cost?.amount_total !== amount
  )
    throw new Error('shipping_amount_mismatch')
  if (
    option.groups.some(
      (g) =>
        g.policy.postal_codes?.length &&
        !g.policy.postal_codes.includes(address.postal_code)
    )
  )
    throw new Error('shipping_postal_code_mismatch')
  const snapshot = {
    ...option,
    country: address.country,
    stripe_shipping_rate: rate.id,
  }
  if (
    checkout.selected_snapshot &&
    JSON.stringify(checkout.selected_snapshot) !== JSON.stringify(snapshot)
  ) {
    // jsonb key ordering differs: compare stable values used for payment, not serialized keys.
    if (
      checkout.selected_snapshot.stripe_shipping_rate !== rate.id ||
      checkout.selected_snapshot.country !== address.country ||
      checkout.selected_snapshot.amount !== amount
    )
      throw new Error('shipping_snapshot_mismatch')
  }
  return snapshot
}
