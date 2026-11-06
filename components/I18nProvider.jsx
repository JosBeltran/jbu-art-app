'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

import { LANGUAGES, languageFromLocales } from '@/lib/localization'
export { LANGUAGES, languageFromLocales, currencyFromLocales } from '@/lib/localization'
const I18nContext = createContext(null)
export function browserLocales() {
  if (typeof navigator === 'undefined') return []
  return navigator.languages?.length ? Array.from(navigator.languages) : [navigator.language].filter(Boolean)
}

export function I18nProvider({ children, initialLocales = [] }) {
  const [browserPreference, setBrowserPreference] = useState(() => languageFromLocales(initialLocales))
  const [browserRegions, setBrowserRegions] = useState(initialLocales)
  const [authUser, setAuthUser] = useState(null)
  const [userPreferences, setUserPreferences] = useState({})
  const [manualLang, setManualLang] = useState(null)
  const [preferencesReady, setPreferencesReady] = useState(false)

  useEffect(() => {
    const locales = browserLocales()
    setBrowserRegions(locales)
    setBrowserPreference(languageFromLocales(locales))
    let mounted = true
    const sync = async (user) => {
      if (!mounted) return
      setAuthUser(user || null)
      setUserPreferences(user ? {
        language: LANGUAGES.includes(user.user_metadata?.jbu_language) ? user.user_metadata.jbu_language : null,
        currency: ['MXN', 'USD'].includes(user.user_metadata?.jbu_currency) ? user.user_metadata.jbu_currency : null,
      } : {})
      setManualLang(null)
      setPreferencesReady(true)
    }
    supabase.auth.getUser().then(({ data }) => sync(data?.user)).catch(() => sync(null))
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'SIGNED_IN' || event === 'SIGNED_OUT') sync(session?.user)
    })
    return () => { mounted = false; listener?.subscription?.unsubscribe() }
  }, [])

  const savePreference = useCallback(async (field, value) => {
    if (!authUser) return
    const key = field === 'language' ? 'jbu_language' : 'jbu_currency'
    const { error } = await supabase.auth.updateUser({ data: { [key]: value } })
    if (error) console.error('Could not save account preference:', error.message)
  }, [authUser])

  const lang = manualLang || userPreferences.language || browserPreference
  const setLang = useCallback((next) => {
    if (!LANGUAGES.includes(next)) return
    setManualLang(next)
    setUserPreferences((current) => ({ ...current, language: next }))
    void savePreference('language', next)
  }, [savePreference])
  const toggleLang = useCallback(() => setLang(lang === 'es' ? 'en' : 'es'), [lang, setLang])
  const t = useCallback((es, en) => (lang === 'en' && en != null ? en : es), [lang])
  const locale = lang === 'es' ? 'es-MX' : 'en-US'
  useEffect(() => { document.documentElement.lang = lang }, [lang])

  const value = useMemo(() => ({
    lang, setLang, toggleLang, t, locale, browserRegions, userPreferences,
    savePreference, preferencesReady, authenticated: Boolean(authUser),
  }), [lang, setLang, toggleLang, t, locale, browserRegions, userPreferences, savePreference, preferencesReady, authUser])
  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>
}

export function useI18n() {
  const context = useContext(I18nContext)
  if (!context) throw new Error('I18nProvider is required')
  return context
}

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
