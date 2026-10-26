export const COOKIE_KEY = 'jbu-cookie-consent'
export const COOKIE_VERSION = '1.0'
export function parseCookieConsent(raw) {
  try {
    const value = typeof raw === 'string' ? JSON.parse(raw) : raw
    if (value?.version !== COOKIE_VERSION || value.necessary !== true || typeof value.analytics !== 'boolean' || typeof value.marketing !== 'boolean' || !Number.isFinite(Date.parse(value.updated_at))) return null
    return value
  } catch { return null }
}
export function cookieChoice(analytics, marketing, now = new Date().toISOString()) {
  return { version: COOKIE_VERSION, necessary: true, analytics: analytics === true, marketing: marketing === true, updated_at: now }
}
export function readCookieConsent() {
  if (typeof window === 'undefined') return null
  try { return parseCookieConsent(window.localStorage.getItem(COOKIE_KEY)) } catch { return null }
}
export function allowsAnalytics() { return readCookieConsent()?.analytics === true }
