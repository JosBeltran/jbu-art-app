'use client'

// Utilidades mínimas para Tidio. La clave pública de Tidio está pensada para ser pública
// (va en la URL del script oficial), por eso se lee de NEXT_PUBLIC_TIDIO_PUBLIC_KEY.

/** Ejecuta fn cuando la API de Tidio esté lista (una sola vez, sin sondeos). */
export function whenTidioReady(fn) {
  if (typeof window === 'undefined') return () => {}
  if (window.tidioChatApi) {
    fn(window.tidioChatApi)
    return () => {}
  }
  const onReady = () => window.tidioChatApi && fn(window.tidioChatApi)
  document.addEventListener('tidioChat-ready', onReady, { once: true })
  return () => document.removeEventListener('tidioChat-ready', onReady)
}
