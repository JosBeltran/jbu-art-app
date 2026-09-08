'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Image from 'next/image'
import Link from 'next/link'

export default function CollectionPage() {
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)

  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  useEffect(() => {
    const fetchUserDataAndArtworks = async () => {
      setLoading(true)

      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      setUser(session.user)

      const { data: profileData } = await supabase
        .from('profiles')
        .select('*')
        .eq('id', session.user.id)
        .maybeSingle()

      if (profileData) {
        setProfile(profileData)
      }

  // Consulta actualizada para incluir obras verificadas Y obras en revisión manual
const { data: userArtworks, error } = await supabase
  .from('artworks')
  .select('*')
  .or(`current_owner_id.eq.${session.user.id},pending_owner_id.eq.${session.user.id}`)
  .order('created_at', { ascending: false })

if (!error && userArtworks) {
  setArtworks(userArtworks)
}

      setLoading(false)
    }

    fetchUserDataAndArtworks()
  }, [router, supabase])

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-xs font-mono text-neutral-500">
        Cargando colección personal...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 sm:p-12">
      <div className="max-w-6xl mx-auto space-y-10">

        {/* ENCABEZADO RESUMIDO DE COLECCIÓN (Sin duplicar menú) */}
        <header className="flex flex-col sm:flex-row sm:items-center justify-between border-b border-neutral-800/80 pb-6 gap-4">
          <div>
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
              Registro Privado
            </p>
            <h1 className="text-2xl font-serif font-light text-white">
              Colección de {profile?.full_name || user?.email?.split('@')[0] || 'Coleccionista'}
            </h1>
          </div>

          <div className="flex items-center space-x-3">
            <span className="text-xs font-mono text-neutral-500 bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg">
              {artworks.length} {artworks.length === 1 ? 'Pieza' : 'Piezas'}
            </span>
          </div>
        </header>

        {/* SECCIÓN DE OBRAS */}
        <section className="space-y-6">
          {artworks.length === 0 ? (
            <div className="bg-neutral-900/30 border border-neutral-800/80 rounded-2xl p-12 text-center space-y-4">
              <p className="text-xs font-mono text-neutral-400">
                Aún no tienes obras vinculadas a tu cuenta.
              </p>
              <p className="text-xs text-neutral-500 max-w-md mx-auto">
                Si adquiriste una pieza física, escanea el código QR en el certificado o ingresa el código de reclamación.
              </p>
              <Link
                href="/claim"
                className="inline-block px-6 py-2.5 bg-neutral-800 hover:bg-neutral-700 text-amber-400 font-mono text-xs rounded-lg border border-amber-500/20 transition"
              >
                Reclamar Nueva Obra
              </Link>
            </div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
              {artworks.map((art) => (
                <div
                  key={art.id}
                  className="bg-neutral-900/40 border border-neutral-800/80 rounded-2xl overflow-hidden flex flex-col justify-between hover:border-neutral-700 transition"
                >
                  <div>
                    {/* VISUALIZACIÓN / FOTO */}
                    <div className="h-52 bg-neutral-950 relative border-b border-neutral-800/80 flex items-center justify-center">
                      {art.image_url ? (
                        <Image
                          src={art.image_url}
                          alt={art.title}
                          fill
                          className="object-cover"
                        />
                      ) : (
                        <div className="text-center font-mono text-[10px] text-neutral-600">
                          [ Fotografía de Archivo ]
                        </div>
                      )}

                   {/* ESTATUS DE VERIFICACIÓN / REVISIÓN */}
<div className="absolute top-3 right-3">
  {art.ownership_status === 'CLAIM_PENDING' || (art.pending_owner_id && !art.current_owner_id) ? (
    <span className="px-2.5 py-1 bg-amber-950/80 border border-amber-500/40 text-amber-400 text-[10px] font-mono rounded-full backdrop-blur-md flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse"></span>
      En Revisión
    </span>
  ) : (
    <span className="px-2.5 py-1 bg-neutral-950/80 border border-emerald-500/40 text-emerald-400 text-[10px] font-mono rounded-full backdrop-blur-md flex items-center gap-1.5">
      <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 animate-pulse"></span>
      Verificada
    </span>
  )}
</div>
                    </div>

                    {/* INFORMACIÓN DE LA OBRA */}
                    <div className="p-5 space-y-3">
                      <div>
                        <p className="text-[11px] font-mono text-amber-500 font-semibold">{art.sku}</p>
                        <h3 className="text-lg font-serif font-medium text-white tracking-wide">{art.title}</h3>
                        <p className="text-xs text-neutral-400">{art.medium || art.technique || 'Técnica Mixta'}</p>
                      </div>

                      {art.certificate_hash && (
                        <div className="bg-neutral-950/80 p-2.5 rounded-xl border border-neutral-800/60 font-mono text-[10px] space-y-1">
                          <p className="text-neutral-500 uppercase tracking-wider text-[9px]">Hash SHA-256:</p>
                          <p className="text-neutral-400 truncate" title={art.certificate_hash}>
                            {art.certificate_hash}
                          </p>
                        </div>
                      )}
                    </div>
                  </div>

                  {/* UN SOLO BOTÓN CLARO Y DIRECTO */}
                  <div className="p-5 pt-0">
                    <Link
                      href={`/verify/${encodeURIComponent(art.sku)}`}
                      className="w-full text-center block py-2.5 bg-neutral-800 hover:bg-amber-500 hover:text-neutral-950 text-amber-400 font-mono text-xs font-semibold rounded-xl border border-amber-500/30 hover:border-amber-500 transition shadow-sm"
                    >
                      Ver Certificado y Proveniencia ↗
                    </Link>
                  </div>
                </div>
              ))}
            </div>
          )}
        </section>

      </div>
    </div>
  )
}