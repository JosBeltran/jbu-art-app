import { invalidatePrintDetail } from '@/lib/printDetailCache.server'
import {
  requireCertificateAdmin,
  serviceClient,
  HttpError,
} from '@/lib/certificates/adminAuth.server'
import { loadShippingSettings } from '@/lib/shippingSettings.server'
import { validateShippingCountries } from '@/lib/shippingCountries'
import {
  validateShippingPolicy,
  validateShippingDefaults,
  validatePolicyIds,
  resolveCartShipping,
} from '@/lib/shippingPolicies'
const response = (data) =>
  Response.json(data, { headers: { 'Cache-Control': 'no-store' } })
function failure(error) {
  const status =
    error instanceof HttpError
      ? error.status
      : error.message?.startsWith('invalid_')
        ? 400
        : 503
  return Response.json(
    {
      error:
        error instanceof HttpError
          ? error.code
          : error.message || 'shipping_configuration_unavailable',
      countries: error.countries,
    },
    { status }
  )
}
export async function GET(request) {
  try {
    await requireCertificateAdmin(request)
    return response(await loadShippingSettings(serviceClient()))
  } catch (error) {
    return failure(error)
  }
}
export async function PUT(request) {
  try {
    const { user } = await requireCertificateAdmin(request)
    const db = serviceClient(),
      body = await request.json()
    if (body.action === 'policy') {
      const policy = validateShippingPolicy(body.policy)
      const result = await db
        .from('shipping_policies')
        .upsert(policy)
        .select('*')
        .single()
      if (result.error || !result.data)
        throw new Error('shipping_policy_save_failed')
    } else if (body.action === 'settings') {
      const countries = validateShippingCountries(body.globalCountries)
      if (!countries) throw new Error('invalid_shipping_countries')
      const defaults = validateShippingDefaults(body.defaults)
      const config = await loadShippingSettings(db)
      if (
        Object.values(defaults)
          .flat()
          .some((id) => !config.policies.some((p) => p.id === id && p.active))
      )
        throw new Error('invalid_shipping_policy')
      const result = await db
        .from('site_settings')
        .update({
          global_shipping_countries: countries,
          default_shipping_policies: defaults,
          updated_by: user.id,
          updated_at: new Date().toISOString(),
        })
        .eq('id', true)
        .select('id')
        .single()
      if (result.error || !result.data)
        throw new Error('shipping_settings_save_failed')
    } else if (body.action === 'override') {
      const ids = validatePolicyIds(body.policyIds)
      if (
        !/^[a-f\d-]{36}$/i.test(body.id || '') ||
        !['artwork', 'print'].includes(body.kind)
      )
        throw new Error('invalid_shipping_policy')
      const config = await loadShippingSettings(db)
      if (ids?.some((id) => !config.policies.some((p) => p.id === id)))
        throw new Error('invalid_shipping_policy')
      const result = await db
        .from(body.kind === 'print' ? 'artwork_prints' : 'artworks')
        .update({ shipping_policy_ids: ids })
        .eq('id', body.id)
        .select('id')
        .single()
      if (result.error || !result.data)
        throw new Error('shipping_override_save_failed')
    } else throw new Error('invalid_shipping_action')
    invalidatePrintDetail()
    return response(await loadShippingSettings(db))
  } catch (error) {
    return failure(error)
  }
}
export async function POST(request) {
  try {
    await requireCertificateAdmin(request)
    const db = serviceClient(),
      body = await request.json(),
      config = await loadShippingSettings(db)
    if (
      !/^[a-f\d-]{36}$/i.test(body.id || '') ||
      !['artwork', 'print'].includes(body.kind)
    )
      throw new Error('invalid_shipping_policy')
    const result = await db
      .from(body.kind === 'print' ? 'artwork_prints' : 'artworks')
      .select('*')
      .eq('id', body.id)
      .single()
    if (result.error || !result.data)
      throw new Error('invalid_shipping_product')
    const item = {
      ...result.data,
      type: body.kind === 'print' ? 'PRINT' : 'ORIGINAL',
      quantity: 1,
    }
    if (body.kind === 'print') {
      const parent = await db
        .from('artworks')
        .select('*')
        .eq('id', item.artwork_id)
        .single()
      if (parent.error) throw new Error('invalid_shipping_product')
      item.artwork = parent.data
    }
    return response(
      resolveCartShipping({
        items: [item],
        ...config,
        destination: body.destination,
        locale: body.locale,
      })
    )
  } catch (error) {
    return failure(error)
  }
}
