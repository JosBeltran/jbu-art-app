'use client'

import { useState, useEffect, Suspense } from 'react'
import { useSearchParams, useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'

function ClaimForm() {
  const searchParams = useSearchParams()
  const router = useRouter()
  const skuParam = searchParams.get('sku') || ''

  const [sku, setSku] = useState(skuParam)
  const [hasToken, setHasToken] = useState(true) // Switch para toggle con/sin token
  const [claimToken, setClaimToken] = useState('')
  const [message, setMessage] = useState('')
  
  const [status, setStatus] = useState({ type: '', text: '' })
  const [loading, setLoading] = useState(false)
  const [user, setUser] = useState(null)

  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  useEffect(() => {
    async function checkAuth() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        const currentPath = `/claim?sku=${encodeURIComponent(skuParam)}`
        router.push(`/login?redirect=${encodeURIComponent(currentPath)}`)
      } else {
        setUser(session.user)
      }
    }
    checkAuth()
  }, [router, skuParam, supabase])

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setStatus({ type: '', text: '' })

    try {
      const res = await fetch('/api/artworks/claim', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          sku: sku.trim().toUpperCase(),
          claim_token: hasToken ? claimToken.trim() : null,
          user_message: !hasToken ? message.trim() : null,
          has_token: hasToken
        }),
      })

      const data = await res.json()

      // Captura precisa del mensaje devuelto por la API
      if (!res.ok) {
        throw new Error(data.message || data.error || 'Ocurrió un error al procesar la reclamación.')
      }

      if (hasToken) {
        setStatus({
          type: 'success',
          text: data.message || '¡Felicidades! La titularidad de la obra ha sido verificada y asignada a tu perfil exitosamente.'
        })
      } else {
        setStatus({
          type: 'info',
          text: data.message || 'Tu solicitud de reclamación ha sido enviada al Estudio JBU. Revisaremos los detalles y nos pondremos en contacto contigo pronto.'
        })
      }

      // Redirección corregida hacia la colección del usuario
      setTimeout(() => {
        router.push('/collection')
      }, 3000)

    } catch (err) {
      setStatus({ type: 'error', text: err.message })
    } finally {
      setLoading(false)
    }
  }

  if (!user) {
    return (
      <div className="min-h-[60vh] flex items-center justify-center">
        <p className="text-sm font-medium text-gray-500 animate-pulse">Verificando sesión de coleccionista...</p>
      </div>
    )
  }

  return (
    <div className="max-w-xl mx-auto py-12 px-4 sm:px-6">
      <div className="bg-white border border-gray-200 rounded-2xl p-6 sm:p-8 shadow-sm space-y-6">
        
        <div>
          <span className="text-[10px] font-bold tracking-widest uppercase bg-amber-100 text-amber-800 px-2.5 py-1 rounded-md">
            Certificado Digital de Autenticidad
          </span>
          <h1 className="text-2xl font-black text-gray-900 mt-3">Reclamar Titularidad de Obra</h1>
          <p className="text-xs text-gray-500 mt-1 leading-relaxed">
            Asocia oficialmente una obra física de la colección JBU a tu cuenta de coleccionista.
          </p>
        </div>

        {status.text && (
          <div className={`p-4 rounded-xl text-xs font-semibold leading-relaxed ${
            status.type === 'success' ? 'bg-emerald-50 text-emerald-800 border border-emerald-200' :
            status.type === 'info' ? 'bg-blue-50 text-blue-800 border border-blue-200' :
            'bg-red-50 text-red-800 border border-red-200'
          }`}>
            {status.text}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-5">
          {/* Identificador SKU */}
          <div>
            <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
              SKU de la Obra *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. DECO-2026-001"
              value={sku}
              onChange={(e) => setSku(e.target.value)}
              className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-black focus:ring-1 focus:ring-black outline-none font-mono text-sm uppercase transition"
            />
          </div>

          {/* Toggle Claim Token / Mensaje */}
          <div className="pt-2 border-t border-gray-100">
            <label className="flex items-center gap-2 cursor-pointer mb-3">
              <input
                type="checkbox"
                checked={!hasToken}
                onChange={(e) => setHasToken(!e.target.checked)}
                className="w-4 h-4 rounded border-gray-300 accent-black cursor-pointer"
              />
              <span className="text-xs font-medium text-gray-700">
                No tengo un Claim Token (Enviar mensaje de verificación al artista)
              </span>
            </label>
          </div>

          {/* Opción A: Claim Token */}
          {hasToken ? (
            <div>
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider mb-2">
                Claim Token *
              </label>
              <input
                type="text"
                required={hasToken}
                placeholder="Ingresa tu código único de 12 a 16 caracteres"
                value={claimToken}
                onChange={(e) => setClaimToken(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-black focus:ring-1 focus:ring-black outline-none font-mono text-sm transition"
              />
              <p className="text-[11px] text-gray-400 mt-1.5">
                Lo encuentras adjunto en la documentación física o de entrega enviada por el estudio.
              </p>
            </div>
          ) : (
            /* Opción B: Mensaje Directo */
            <div className="space-y-2">
              <label className="block text-xs font-bold text-gray-700 uppercase tracking-wider">
                Mensaje para el Estudio JBU *
              </label>
              <textarea
                required={!hasToken}
                rows={4}
                placeholder="Platícanos cómo y cuándo adquiriste la pieza, o si requieres que emitamos un nuevo certificado para ti..."
                value={message}
                onChange={(e) => setMessage(e.target.value)}
                className="w-full px-4 py-3 rounded-lg border border-gray-200 focus:border-black focus:ring-1 focus:ring-black outline-none text-xs transition leading-relaxed"
              />
              <p className="text-[11px] text-gray-400">
                Revisaremos los registros y coordinaremos la validación manual de tu pieza.
              </p>
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            className="w-full bg-black text-white py-3.5 px-4 rounded-xl font-bold text-xs uppercase tracking-wider hover:bg-gray-800 transition disabled:opacity-50 shadow-sm"
          >
            {loading ? 'Procesando...' : hasToken ? 'Validar y Reclamar Obra' : 'Enviar Solicitud de Reclamación'}
          </button>
        </form>

      </div>
    </div>
  )
}

export default function ClaimPage() {
  return (
    <Suspense fallback={<div className="text-center py-12 text-xs">Cargando...</div>}>
      <ClaimForm />
    </Suspense>
  )
}