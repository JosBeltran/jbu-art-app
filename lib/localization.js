/** Browser locale detection without geolocation or language-to-currency assumptions. */
export const LANGUAGES = ['es', 'en']
export function languageFromLocales(locales) {
  for (const value of locales || []) {
    const language = String(value || '').toLowerCase().split('-')[0]
    if (LANGUAGES.includes(language)) return language
  }
  return 'en'
}
export function currencyFromLocales(locales) {
  const locale = String(locales?.[0] || '').replace('_', '-')
  const match = locale.match(/^[a-z]{2,3}-([a-z]{2})\b/i)
  return match?.[1]?.toUpperCase() === 'MX' ? 'MXN' : 'USD'
}
