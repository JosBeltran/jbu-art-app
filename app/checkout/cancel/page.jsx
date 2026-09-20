'use client'

import { useSearchParams } from 'next/navigation'
import Link from 'next/link'
import { Suspense } from 'react'

function CancelContent() {
  const searchParams = useSearchParams()
  const artworkId = searchParams.get('artwork_id')

  return (
    <div className="max-w-md w-full bg-violet-900 border border-violet-800 rounded-2xl p-8 text-center space-y-6 shadow-2xl">
      <div className="w-16 h-16 bg-amber-500/10 border border-amber-500/30 rounded-full flex items-center justify-center mx-auto text-amber-400 text-2xl">
        !
      </div>

      <div className="space-y-2">
        <h1 className="text-2xl font-serif font-light text-white">
          Proceso Cancelado
        </h1>
        <p className="text-xs font-mono text-violet-400 leading-relaxed">
          No se ha realizado ningún cargo a tu cuenta. La obra sigue disponible en el inventario.
        </p>
      </div>

      <div className="pt-4 border-t border-violet-800 space-y-3">
        {artworkId ? (
          <Link
            href={`/artwork/${artworkId}`}
            className="block w-full py-3 bg-violet-800 hover:bg-violet-700 text-violet-200 font-mono text-xs rounded-lg transition"
          >
            Reintentar Adquisición
          </Link>
        ) : null}

        <Link
          href="/collection"
          className="block w-full py-3 bg-amber-500 hover:bg-amber-400 text-violet-950 font-mono font-bold text-xs rounded-lg transition"
        >
          Explorar Colección
        </Link>
      </div>
    </div>
  )
}

export default function CancelPage() {
  return (
    <div className="min-h-screen bg-violet-950 text-violet-100 flex items-center justify-center p-6">
      <Suspense fallback={
        <div className="text-xs font-mono text-violet-500">Cargando...</div>
      }>
        <CancelContent />
      </Suspense>
    </div>
  )
}