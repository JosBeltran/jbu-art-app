export function isPhysicalEdition(artwork) {
  return artwork?.physical_edition_type === 'LIMITED_EDITION'
}

export function editionAvailability(counts) {
  if (!counts) return 'configuration'
  const { edition_size: total, available, reserved, sold, sales_enabled: enabled } = counts
  if (!Number.isInteger(total) || total < 1 ||
    ![available, reserved, sold].every(n => Number.isInteger(n) && n >= 0) ||
    available + reserved + sold !== total) return 'configuration'
  if (sold === total) return 'sold-out'
  if (!enabled) return 'paused'
  if (available === 0) return 'reserved'
  if (available <= Math.max(1, Math.floor(total / 10))) return 'limited'
  return 'available'
}

export function editionAvailabilityLabel(state, t) {
  const labels = {
    configuration: ['Configuración no disponible', 'Configuration unavailable'],
    'sold-out': ['Edición agotada', 'Edition sold out'],
    paused: ['Ventas pausadas', 'Sales paused'],
    reserved: ['Ejemplares temporalmente reservados', 'Units temporarily reserved'],
    limited: ['Disponibilidad limitada', 'Limited availability'],
    available: ['Disponible', 'Available'],
  }
  return t(...labels[state])
}

export function editionDesignation(size, t) {
  return size > 0 ? t(`Edición limitada de ${size}`, `Limited Edition of ${size}`)
    : t('Edición física limitada', 'Physical Limited Edition')
}

export function numberPhysicalEdition(number, total) {
  if (!number || !total) return null
  const digits = Math.max(3, String(total).length)
  return [number, total].map(value => String(value).padStart(digits, '0')).join('/')
}
