'use client'

// Track readiness without polling or assuming that an existing API is loaded.
const readyApis = new WeakSet()

/** Ejecuta fn cuando la API de Tidio esté lista (una sola vez, sin sondeos). */
export function whenTidioReady(fn) {
  if (typeof window === 'undefined') return () => {}
  let active = true
  let called = false
  const api = window.tidioChatApi
  const onReady = () => {
    const current = window.tidioChatApi
    if (!active || called || !current) return
    called = true
    readyApis.add(current)
    try { fn(current) } catch { /* Provider errors must not break the page. */ }
  }
  document.addEventListener('tidioChat-ready', onReady)
  if (api && readyApis.has(api)) onReady()
  else {
    try { api?.on?.('ready', onReady) } catch { /* Document ready event remains available. */ }
  }
  return () => {
    active = false
    document.removeEventListener('tidioChat-ready', onReady)
    try { api?.off?.('ready', onReady) } catch { /* Ignore unsupported cleanup. */ }
  }
}
