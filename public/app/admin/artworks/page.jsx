'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import Image from 'next/image'

export default function AdminArtworksPage() {
  const router = useRouter()


  const [loading, setLoading] = useState(true)
  const [artworks, setArtworks] = useState([])
  const [errorMsg, setErrorMsg] = useState('')

  useEffect(() => {
    const verifyAdminAndFetchArtworks = async () => {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profile || profile.role !== 'admin') {
        router.push('/collection')
        return
      }

      // Consulta de inventario con datos del propietario actual
      const { data: artworksData, error: artworksError } = await supabase
        .from('artworks')
        .select(`
          *,
          current_owner:profiles!artworks_current_owner_id_fkey(full_name, email)
        `)
        .order('created_at', { ascending: false })

      if (artworksError) {
        setErrorMsg('Error al cargar inventario: ' + artworksError.message)
      } else {
        setArtworks(artworksData || [])
      }

      setLoading(false)
    }

    verifyAdminAndFetchArtworks()
  }, [router])

  if (loading) {
    return (
      <div className="min-h-screen bg-violet-950 flex items-center justify-center text-xs font-mono text-violet-500">
        Cargando inventario de obras...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-violet-950 text-violet-100 font-sans p-6 sm:p-12">
      <div className="max-w-6xl mx-auto space-y-8">

        {/* ENCABEZADO */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-violet-800 pb-6 gap-4">
          <div>
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
              Panel Administrativo — Estudio JBU
            </p>
            <h1 className="text-2xl font-serif font-light text-white">
              Inventario de Obras
            </h1>
          </div>

          <div className="flex items-center space-x-4">
            <span className="text-xs font-mono text-violet-400 bg-violet-900 border border-violet-800 px-3 py-1.5 rounded-lg">
              {artworks.length} {artworks.length === 1 ? 'Pieza' : 'Piezas'}
            </span>

            <Link
              href="/admin/artworks/new"
              className="px-4 py-2 bg-amber-500 hover:bg-amber-400 text-violet-950 text-xs font-mono font-bold rounded-lg transition"
            >
              + Registrar Nueva Obra
            </Link>
          </div>
        </div>

        {/* MENSAJE DE ERROR */}
        {errorMsg && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-4 text-xs font-mono text-red-300">
            🚨 {errorMsg}
          </div>
        )}

        {/* MATRIZ DE INVENTARIO */}
        <div className="bg-violet-900/40 border border-violet-800 rounded-2xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-left border-collapse">
              <thead>
                <tr className="border-b border-violet-800 bg-violet-950/60 text-[10px] font-mono text-violet-400 uppercase tracking-wider">
                  <th className="p-4">Obra / SKU</th>
                  <th className="p-4">Serie / Año</th>
                  <th className="p-4">Precio</th>
                  <th className="p-4">Estado</th>
                  <th className="p-4">Propietario / Claim Code</th>
                  <th className="p-4 text-right">Acciones</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-violet-800/60 text-xs font-mono">
                {artworks.length === 0 ? (
                  <tr>
                    <td colSpan={6} className="p-8 text-center text-violet-500 font-mono text-xs">
                      No hay obras registradas aún. Usa el botón superior para dar de alta la primera pieza.
                    </td>
                  </tr>
                ) : (
                  artworks.map((art) => (
                    <tr key={art.id} className="hover:bg-violet-900/60 transition">
                      
                      {/* Obra e imagen */}
                      <td className="p-4">
                        <div className="flex items-center space-x-3">
                          <div className="w-12 h-12 bg-violet-950 border border-violet-800 rounded-lg overflow-hidden relative shrink-0">
                            {art.image_url ? (
                              <Image
                                src={art.image_url}
                                alt={art.title}
                                fill
                                className="object-cover"
                              />
                            ) : (
                              <div className="w-full h-full flex items-center justify-center text-[9px] text-violet-600">
                                S/I
                              </div>
                            )}
                          </div>
                          <div>
                            <p className="font-serif font-medium text-sm text-white">
                              {art.title}
                            </p>
                            <span className="text-[10px] text-amber-500 font-bold uppercase">
                              {art.sku?.toUpperCase()}
                            </span>
                          </div>
                        </div>
                      </td>

                      {/* Serie / Año */}
                      <td className="p-4 text-violet-300">
                        <p>{art.series}</p>
                        <p className="text-[11px] text-violet-500">{art.year}</p>
                      </td>

                      {/* Precio */}
                      <td className="p-4 text-violet-200">
                        {art.price ? `$${Number(art.price).toLocaleString()} MXN` : 'N/A'}
                      </td>

                      {/* Estado */}
                      <td className="p-4">
                        <span className={`px-2.5 py-1 rounded-full text-[10px] uppercase font-bold border ${
                          art.ownership_status === 'CLAIMED'
                            ? 'bg-emerald-950/80 text-emerald-400 border-emerald-500/40'
                            : art.ownership_status === 'RESERVED'
                            ? 'bg-amber-950/80 text-amber-400 border-amber-500/40'
                            : 'bg-violet-950 text-violet-400 border-violet-800'
                        }`}>
                          {art.ownership_status || 'AVAILABLE'}
                        </span>
                      </td>

                      {/* Propietario o Claim Code */}
                      <td className="p-4 space-y-1">
                        {art.current_owner ? (
                          <div>
                            <p className="text-white font-sans text-xs">{art.current_owner.full_name || 'Coleccionista'}</p>
                            <p className="text-[10px] text-violet-500">{art.current_owner.email}</p>
                          </div>
                        ) : (
                          <div className="text-[11px]">
                            <span className="text-violet-500">Code: </span>
                            <span className="text-amber-400 font-bold select-all">{art.claim_code || 'N/A'}</span>
                          </div>
                        )}
                      </td>

                      {/* Acciones */}
                      <td className="p-4 text-right space-x-2">
                        <Link
                          href={`/verify/${encodeURIComponent(art.sku)}`}
                          className="px-2.5 py-1 bg-violet-950 border border-violet-800 text-violet-300 hover:text-white rounded-md text-[11px] transition inline-block"
                        >
                          Certificado ↗
                        </Link>
                      </td>

                    </tr>
                  ))
                )}
              </tbody>
            </table>
          </div>
        </div>

      </div>
    </div>
  )
}