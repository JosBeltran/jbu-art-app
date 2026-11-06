'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'jbu-theme'

const AppThemeContext = createContext({
  dark: false,
  toggleTheme: () => {},
})

export function AppThemeProvider({ children, initialDark = false }) {
  const [dark, setDark] = useState(initialDark)
  const [loaded, setLoaded] = useState(false)

  // Leer la preferencia guardada al montar (solo en el navegador)
  useEffect(() => {
    try {
      const preference = window.localStorage.getItem(STORAGE_KEY)
      if (preference === 'dark' && !initialDark) setDark(true)
      if (preference === 'light' && initialDark) setDark(false)
    } catch {
      // localStorage no disponible; se mantiene el tema claro
    }
    setLoaded(true)
  }, [initialDark])

  // Aplicar la clase global y guardar la preferencia
  useEffect(() => {
    document.documentElement.classList.toggle('jbu-dark', dark)
    if (!loaded) return
    try {
      window.localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
      document.cookie = `${STORAGE_KEY}=${dark ? 'dark' : 'light'}; Path=/; Max-Age=31536000; SameSite=Lax`
    } catch {
      // sin persistencia disponible
    }
  }, [dark, loaded])

  const toggleTheme = useCallback(() => setDark((value) => !value), [])

  const value = useMemo(() => ({ dark, toggleTheme }), [dark, toggleTheme])

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme() {
  return useContext(AppThemeContext)
}
