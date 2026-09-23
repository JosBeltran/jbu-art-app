'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'jbu-lang'
export const LANGUAGES = ['es', 'en']

const I18nContext = createContext({
  lang: 'es',
  setLang: () => {},
  toggleLang: () => {},
  // eslint-disable-next-line no-unused-vars
  t: (es, en) => (en ? es : es),
  locale: 'es-MX',
})

function detectLang() {
  try {
    const saved = window.localStorage.getItem(STORAGE_KEY)
    if (saved && LANGUAGES.includes(saved)) return saved
    const nav = (window.navigator.languages?.[0] || window.navigator.language || 'es').toLowerCase()
    return nav.startsWith('es') ? 'es' : 'en'
  } catch {
    return 'es'
  }
}

export function I18nProvider({ children }) {
  const [lang, setLangState] = useState('es')

  // Detecta el idioma guardado o el del navegador (solo en el cliente).
  useEffect(() => {
    const detected = detectLang()
    // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura inicial de preferencia
    if (detected !== 'es') setLangState(detected)
  }, [])

  useEffect(() => {
    document.documentElement.lang = lang
  }, [lang])

  const setLang = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return
    setLangState(next)
    try {
      window.localStorage.setItem(STORAGE_KEY, next)
    } catch {
      // sin persistencia
    }
  }, [])

  const toggleLang = useCallback(() => setLang(lang === 'es' ? 'en' : 'es'), [lang, setLang])

  // t('Texto en español', 'English text') → devuelve el texto del idioma activo.
  const t = useCallback((es, en) => (lang === 'en' && en != null ? en : es), [lang])

  const value = useMemo(
    () => ({ lang, setLang, toggleLang, t, locale: lang === 'en' ? 'en-US' : 'es-MX' }),
    [lang, setLang, toggleLang, t]
  )

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  return useContext(I18nContext)
}

/**
 * Devuelve el campo traducido de un registro (p. ej. artwork.title_en) con
 * respaldo al valor en español si no existe traducción.
 */
export function localized(record, field, lang) {
  if (!record) return ''
  if (lang === 'en') {
    const en = record[`${field}_en`]
    if (en != null && String(en).trim() !== '') return en
  }
  return record[field] ?? ''
}

export function useLocalized() {
  const { lang } = useI18n()
  return useCallback((record, field) => localized(record, field, lang), [lang])
}
