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

export function authErrorMessage(error) {
  const message = String(error?.message || '').toLowerCase()
  if (message.includes('invalid login credentials')) return 'El correo o la contraseña no son correctos.'
  if (message.includes('email not confirmed')) return 'Confirma tu correo antes de iniciar sesión.'
  if (message.includes('user already registered')) return 'Ya existe una cuenta con este correo.'
  if (message.includes('password should be')) return 'La contraseña debe tener al menos 8 caracteres.'
  if (message.includes('rate limit')) return 'Demasiados intentos. Espera unos minutos e inténtalo de nuevo.'
  return 'No pudimos completar la solicitud. Inténtalo de nuevo.'
}
