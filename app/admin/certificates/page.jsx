'use client'

import { useState, useEffect } from 'react'

export default function AdminCertificatesPage() {
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [processingId, setProcessingId] = useState(null)
  const [message, setMessage] = useState(null)

  // Cargar obras en estado de reclamo pendiente o ya verificadas
  const fetchPendingClaims = async () => {
    setLoading(true)
    try {
      const res = await fetch('/api/admin/pending-claims')
      const data = await res.json()
      if (res.ok) {
        setArtworks(data.artworks || [])
      } else {
        setMessage({ type: 'error', text: data.error || 'Error al cargar las solicitudes' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error de red al consultar solicitudes' })
    } finally {
      setLoading(false)
    }
  }

  useEffect(() => {
    fetchPendingClaims()
  }, [])

  // Aprobar la solicitud de certificado
  const handleApprove = async (artworkId, userId) => {
    if (!userId) {
      setMessage({ type: 'error', text: 'No se identificó el usuario solicitante.' })
      return
    }

    setProcessingId(artworkId)
    setMessage(null)

    try {
      const res = await fetch('/api/artworks/approve', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ artworkId, userId })
      })

      const data = await res.json()

      if (res.ok) {
        setMessage({ 
          type: 'success', 
          text: `Certificado emitido exitosamente. Hash: ${data.certificateHash ? data.certificateHash.substring(0, 16) : 'N/A'}...` 
        })
        // Recargar la lista
        fetchPendingClaims()
      } else {
        setMessage({ type: 'error', text: data.error || data.message || 'No se pudo emitir el certificado' })
      }
    } catch (err) {
      setMessage({ type: 'error', text: 'Error de conexión con el servidor' })
    } finally {
      setProcessingId(null)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 sm:p-12">
      <div className="max-w-5xl mx-auto space-y-8">
        
        {/* ENCABEZADO ADMIN */}
        <header className="flex justify-between items-center border-b border-neutral-800 pb-6">
          <div>
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
              Estudio JBU — Control de Autenticidad
            </p>
            <h1 className="text-2xl font-serif font-light text-white pt-1">
              Aprobación de Certificados Digitales
            </h1>
          </div>
          <button
            onClick={fetchPendingClaims}
            className="px-4 py-2 bg-neutral-900 border border-neutral-800 text-xs font-mono rounded-lg hover:bg-neutral-800 transition text-neutral-300"
          >
            Actualizar Lista 🔄
          </button>
        </header>

        {/* ALERTAS / MENSAJES */}
        {message && (
          <div className={`p-4 rounded-xl text-xs font-mono ${
            message.type === 'success' 
              ? 'bg-emerald-950/80 border border-emerald-500/40 text-emerald-300' 
              : 'bg-rose-950/80 border border-rose-500/40 text-rose-300'
          }`}>
            {message.text}
          </div>
        )}

        {/* TABLA DE SOLICITUDES */}
        <div className="bg-neutral-900/40 border border-neutral-800 rounded-2xl overflow-hidden">
          {loading ? (
            <div className="p-12 text-center text-xs font-mono text-neutral-500">
              Cargando solicitudes de registro...
            </div>
          ) : artworks.length === 0 ? (
            <div className="p-12 text-center text-xs font-mono text-neutral-500 space-y-2">
              <p>No hay solicitudes de certificados pendientes por autorizar.</p>
              <p className="text-[10px] text-neutral-600">
                Cuando un comprador solicite el certificado de su obra, aparecerá en esta lista.
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto">
              <table className="w-full text-left border-collapse text-xs">
                <thead>
                  <tr className="border-b border-neutral-800 bg-neutral-900/80 text-[10px] font-mono uppercase text-neutral-400 tracking-wider">
                    <th className="p-4">Obra / SKU</th>
                    <th className="p-4">Solicitante / Mensaje</th>
                    <th className="p-4">Estado</th>
                    <th className="p-4">Hash / Emisión</th>
                    <th className="p-4 text-right">Acción</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-neutral-800/60 font-sans">
                  {artworks.map((art) => {
                    const isPending = art.ownership_status === 'CLAIM_PENDING'
                    const isVerified = art.ownership_status === 'VERIFIED' || art.ownership_status === 'CLAIMED'

                    // Resolver datos del usuario solicitante o dueño
                    const userProfile = art.pending_profile || art.owner_profile || art.profiles
                    const targetUserId = art.pending_owner_id || art.current_owner_id

                    return (
                      <tr key={art.id} className="hover:bg-neutral-900/50 transition">
                        {/* DETALLE DE OBRA */}
                        <td className="p-4">
                          <div className="font-medium text-neutral-200">{art.title}</div>
                          <div className="font-mono text-[10px] text-amber-500">{art.sku}</div>
                        </td>

                        {/* DATOS DEL COMPRADOR Y SU MENSAJE */}
                        <td className="p-4">
                          <div className="text-neutral-200 font-medium">
                            {userProfile?.full_name || 'Usuario Registrado'}
                          </div>
                          <div className="font-mono text-[10px] text-neutral-500">
                            {userProfile?.email || targetUserId}
                          </div>
                          {art.claim_notes && (
                            <div className="text-[11px] text-amber-300/80 italic mt-1 bg-amber-950/30 p-2 rounded border border-amber-900/30">
                              "{art.claim_notes}"
                            </div>
                          )}
                        </td>

                        {/* ESTADO */}
                        <td className="p-4">
                          {isPending && (
                            <span className="inline-flex items-center px-2 py-1 bg-amber-950 border border-amber-500/30 text-amber-400 text-[10px] font-mono rounded-full">
                              ⏳ Pendiente de Firma
                            </span>
                          )}
                          {isVerified && (
                            <span className="inline-flex items-center px-2 py-1 bg-emerald-950 border border-emerald-500/30 text-emerald-400 text-[10px] font-mono rounded-full">
                              ✅ Emitido & Verificado
                            </span>
                          )}
                        </td>

                        {/* HASH / EMISIÓN */}
                        <td className="p-4 font-mono text-[10px] text-neutral-400 max-w-xs truncate">
                          {art.certificate_hash ? (
                            <span className="text-amber-400/90" title={art.certificate_hash}>
                              {art.certificate_hash.substring(0, 16)}...
                            </span>
                          ) : (
                            <span className="text-neutral-600">—</span>
                          )}
                        </td>

                        {/* BOTÓN DE ACCIÓN */}
                        <td className="p-4 text-right">
                          {isPending && (
                            <button
                              onClick={() => handleApprove(art.id, targetUserId)}
                              disabled={processingId === art.id}
                              className="px-4 py-2 bg-emerald-600 hover:bg-emerald-500 text-white font-mono text-[11px] font-bold rounded-lg shadow transition disabled:opacity-50"
                            >
                              {processingId === art.id ? 'Emitiendo...' : 'Autorizar & Firmar ✍️'}
                            </button>
                          )}
                          {isVerified && (
                            <a
                              href={`/verify/${art.sku}`}
                              target="_blank"
                              rel="noreferrer"
                              className="inline-block px-3 py-1.5 bg-neutral-800 hover:bg-neutral-700 text-neutral-300 font-mono text-[10px] rounded-md transition"
                            >
                              Ver Registro ↗
                            </a>
                          )}
                        </td>
                      </tr>
                    )
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>

      </div>
    </div>
  )
}