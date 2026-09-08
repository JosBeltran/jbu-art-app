'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function SuccessContent() {
  const searchParams = useSearchParams()
  const sessionId = searchParams.get('session_id')

  return (
    <div className="max-w-md w-full bg-neutral-900 border border-neutral-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
      <div className="w-16 h-16 bg-emerald-500/10 border border-emerald-500/30 rounded-full flex items-center justify-center mx-auto text-emerald-400 text-2xl">
        ✓
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-light text-white">
          Adquisición Confirmada
        </h1>
        <p className="text-xs font-mono text-neutral-400 leading-relaxed">
          El proceso de pago se ha completado con éxito. Hemos registrado tu transacción.
        </p>
      </div>

      {sessionId && (
        <div className="bg-neutral-950 p-3 rounded-lg border border-neutral-800/80 text-left">
          <span className="block text-[10px] font-mono text-neutral-500 uppercase tracking-wider mb-1">
            ID de Confirmación
          </span>
          <p className="text-[11px] font-mono text-neutral-300 truncate">
            {sessionId}
          </p>
        </div>
      )}

      <div className="pt-4 border-t border-neutral-800 space-y-3">
        <Link
          href="/collection"
          className="block w-full py-3 bg-amber-500 hover:bg-amber-400 text-neutral-950 font-mono font-bold text-xs rounded-lg transition"
        >
          Volver a la Colección
        </Link>
      </div>
    </div>
  )
}

export default function SuccessPage() {
  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 flex items-center justify-center p-6">
      <Suspense fallback={
        <div className="text-xs font-mono text-neutral-500">Cargando confirmación...</div>
      }>
        <SuccessContent />
      </Suspense>
    </div>
  )
}