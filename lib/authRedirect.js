const DESTINATION_KEY = 'jbu:auth-next'
const PENDING_KEY = 'jbu:auth-pending'

export function safeRedirectPath(value, fallback = '/profile') {
  if (!value || typeof value !== 'string') return fallback
  if (!value.startsWith('/') || value.startsWith('//')) return fallback

  try {
    const parsed = new URL(value, 'http://localhost')
    if (parsed.origin !== 'http://localhost') return fallback
    return `${parsed.pathname}${parsed.search}${parsed.hash}`
  } catch {
    return fallback
  }
}

/**
 * Guarda el destino elegido antes de salir hacia el proveedor externo (Google).
 * Así podemos completar la sesión aunque el proveedor devuelva al usuario
 * a la portada en lugar de la ruta de retorno configurada.
 */
export function rememberAuthDestination(destination) {
  if (typeof window === 'undefined') return
  try {
    window.localStorage.setItem(DESTINATION_KEY, safeRedirectPath(destination, '/profile'))
    window.localStorage.setItem(PENDING_KEY, '1')
  } catch {
    /* almacenamiento no disponible */
  }
}

export function hasPendingAuthReturn() {
  if (typeof window === 'undefined') return false
  try {
    return window.localStorage.getItem(PENDING_KEY) === '1'
  } catch {
    return false
  }
}

export function consumeAuthDestination() {
  if (typeof window === 'undefined') return ''
  try {
    const value = window.localStorage.getItem(DESTINATION_KEY) || ''
    window.localStorage.removeItem(DESTINATION_KEY)
    window.localStorage.removeItem(PENDING_KEY)
    return value
  } catch {
    return ''
  }
}

export function authErrorMessage(error, lang = 'es') {
  const message = String(error?.message || '').toLowerCase()
  const isEn = lang === 'en'
  if (message.includes('invalid login credentials')) {
    return isEn ? 'The email or password is incorrect.' : 'El correo o la contraseña no son correctos.'
  }
  if (message.includes('email not confirmed')) {
    return isEn ? 'Confirm your email before signing in.' : 'Confirma tu correo antes de iniciar sesión.'
  }
  if (message.includes('user already registered')) {
    return isEn ? 'An account with this email already exists.' : 'Ya existe una cuenta con este correo.'
  }
  if (message.includes('password should be')) {
    return isEn ? 'The password must be at least 8 characters.' : 'La contraseña debe tener al menos 8 caracteres.'
  }
  if (message.includes('rate limit')) {
    return isEn ? 'Too many attempts. Wait a few minutes and try again.' : 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  }
  return isEn ? 'We could not complete the request. Please try again.' : 'No pudimos completar la solicitud. Inténtalo de nuevo.'
}
