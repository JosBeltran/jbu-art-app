import { DateTime } from 'luxon'

export const DELIVERY_DEFAULTS = Object.freeze({
  enabled: false, paymentOnDeliveryEnabled: false, state: 'Nuevo León',
  municipalities: ['Monterrey', 'San Nicolás de los Garza', 'Guadalupe', 'San Pedro Garza García', 'Santa Catarina', 'Apodaca', 'General Escobedo', 'García', 'Juárez'],
  timezone: 'America/Monterrey', businessStart: '10:00', businessEnd: '22:00',
  standardLeadHours: 3, largeLeadDays: 1, slotMinutes: 120,
})
const norm = v => String(v ?? '').normalize('NFD').replace(/[\u0300-\u036f]/g, '').trim().toLowerCase().replace(/\s+/g, ' ')
const aliases = { 'san nicolas': 'san nicolas de los garza', 'san pedro': 'san pedro garza garcia', escobedo: 'general escobedo' }
const municipality = v => aliases[norm(v)] ?? norm(v)
const minutes = v => {
  if (typeof v !== 'string' || !/^([01]\d|2[0-3]):[0-5]\d$/.test(v)) throw new Error('invalid_business_hours')
  const [h, m] = v.split(':').map(Number)
  return h * 60 + m
}
export function deliveryConfig(overrides = {}) {
  const c = { ...DELIVERY_DEFAULTS, ...overrides }
  if (typeof c.enabled !== 'boolean' || typeof c.paymentOnDeliveryEnabled !== 'boolean') throw new Error('invalid_enablement')
  if (!DateTime.now().setZone(c.timezone).isValid) throw new Error('invalid_timezone')
  if (!norm(c.state) || !Array.isArray(c.municipalities) || !c.municipalities.length || c.municipalities.some(m => typeof m !== 'string' || !norm(m))) throw new Error('invalid_service_area')
  const duration = minutes(c.businessEnd) - minutes(c.businessStart)
  if (duration <= 0 || !Number.isInteger(c.slotMinutes) || c.slotMinutes <= 0 || c.slotMinutes > duration) throw new Error('invalid_business_hours')
  if (!Number.isFinite(c.standardLeadHours) || c.standardLeadHours < 0 || c.standardLeadHours > 720) throw new Error('invalid_standard_lead')
  if (!Number.isInteger(c.largeLeadDays) || c.largeLeadDays < 1 || c.largeLeadDays > 365) throw new Error('invalid_large_lead')
  return c
}
export function isEligibleAddress(address, config = {}) {
  const c = deliveryConfig(config)
  return c.enabled && c.paymentOnDeliveryEnabled && norm(address?.country) === 'mx'
    && norm(address?.state) === norm(c.state)
    && c.municipalities.some(m => municipality(m) === municipality(address?.municipality ?? address?.city))
}
export function getOrderDeliveryCategory(artworks) {
  if (!Array.isArray(artworks) || !artworks.length) throw new Error('empty_order')
  if (artworks.some(a => !['standard', 'large'].includes(a?.delivery_category))) throw new Error('category_requires_review')
  return artworks.some(a => a.delivery_category === 'large') ? 'large' : 'standard'
}
function instant(value, zone) {
  if (typeof value !== 'string' || !/(Z|[+-]\d{2}:\d{2})$/.test(value)) throw new Error('invalid_timestamp')
  const d = DateTime.fromISO(value, { setZone: true }).setZone(zone)
  if (!d.isValid) throw new Error('invalid_timestamp')
  return d
}
export function getAvailableSlots({ category, now, date, config = {} }) {
  const c = deliveryConfig(config)
  if (!['standard', 'large'].includes(category)) throw new Error('invalid_category')
  if (typeof date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(date)) throw new Error('invalid_date')
  const clock = instant(now, c.timezone), day = DateTime.fromISO(date, { zone: c.timezone }).startOf('day')
  if (!day.isValid || day.toISODate() !== date) throw new Error('invalid_date')
  const earliest = category === 'large' ? clock.startOf('day').plus({ days: c.largeLeadDays }) : clock.plus({ hours: c.standardLeadHours })
  const slots = []
  for (let m = minutes(c.businessStart); m + c.slotMinutes <= minutes(c.businessEnd); m += c.slotMinutes) {
    const endM = m + c.slotMinutes
    const start = day.set({ hour: Math.floor(m / 60), minute: m % 60 })
    const end = day.set({ hour: Math.floor(endM / 60), minute: endM % 60 })
    if (start < earliest || start <= clock || end <= start || start.hour * 60 + start.minute !== m || end.hour * 60 + end.minute !== endM) continue
    slots.push({ start: start.toUTC().toISO(), end: end.toUTC().toISO(), timezone: c.timezone, date, startTime: start.toFormat('HH:mm'), endTime: end.toFormat('HH:mm') })
  }
  return slots
}
export function validateDeliverySelection({ category, now, start, end, config = {} }) {
  const c = deliveryConfig(config), selected = instant(start, c.timezone), selectedEnd = instant(end, c.timezone)
  const valid = getAvailableSlots({ category, now, date: selected.toISODate(), config: c }).find(s => DateTime.fromISO(s.start).toMillis() === selected.toMillis() && DateTime.fromISO(s.end).toMillis() === selectedEnd.toMillis())
  if (!valid) throw new Error('slot_unavailable')
  return valid
}