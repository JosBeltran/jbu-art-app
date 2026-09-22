'use client'

import { createContext, useCallback, useContext, useEffect, useMemo, useState } from 'react'

const STORAGE_KEY = 'jbu-theme'

const AppThemeContext = createContext({
  dark: false,
  toggleTheme: () => {},
})

export function AppThemeProvider({ children }) {
  const [dark, setDark] = useState(false)

  // Leer la preferencia guardada al montar (solo en el navegador)
  useEffect(() => {
    try {
      if (window.localStorage.getItem(STORAGE_KEY) === 'dark') {
        // eslint-disable-next-line react-hooks/set-state-in-effect -- lectura inicial de la preferencia guardada
        setDark(true)
      }
    } catch {
      // localStorage no disponible; se mantiene el tema claro
    }
  }, [])

  // Aplicar la clase global y guardar la preferencia
  useEffect(() => {
    document.documentElement.classList.toggle('jbu-dark', dark)
    try {
      window.localStorage.setItem(STORAGE_KEY, dark ? 'dark' : 'light')
    } catch {
      // sin persistencia disponible
    }
  }, [dark])

  const toggleTheme = useCallback(() => setDark((value) => !value), [])

  const value = useMemo(() => ({ dark, toggleTheme }), [dark, toggleTheme])

  return <AppThemeContext.Provider value={value}>{children}</AppThemeContext.Provider>
}

export function useAppTheme() {
  return useContext(AppThemeContext)
}
