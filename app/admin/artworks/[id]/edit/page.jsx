'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import ImageUploader from '../../components/ImageUploader'
import Link from 'next/link'

export default function EditArtworkPage({ params }) {
  const { id } = use(params)
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [formData, setFormData] = useState({
    title: '',
    series: 'DECO',
    medium: '',
    year: new Date().getFullYear(),
    base_price_mxn: '',
    dimensions: '',
    ownership_status: 'AVAILABLE',
    primary_image_url: '',
    description: ''
  })

  useEffect(() => {
    const fetchArtwork = async () => {
      setLoading(true)

      // 1. Verificar sesión activa
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) {
        router.push('/login')
        return
      }

      // 2. Verificar rol de administrador
      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      if (!profile || profile.role !== 'admin') {
        router.push('/collection')
        return
      }

      // 3. Cargar datos de la obra
      const { data: artwork, error } = await supabase
        .from('artworks')
        .select('*')
        .eq('id', id)
        .single()

      if (error || !artwork) {
        setErrorMsg('No se encontró la obra especificada.')
      } else {
        setFormData({
          title: artwork.title || '',
          series: artwork.series || 'DECO',
          medium: artwork.medium || '',
          year: artwork.year || new Date().getFullYear(),
          base_price_mxn: artwork.base_price_mxn || '',
          dimensions: artwork.dimensions || '',
          ownership_status: artwork.ownership_status || 'AVAILABLE',
          primary_image_url: artwork.primary_image_url || '',
          description: artwork.description || ''
        })
      }

      setLoading(false)
    }

    fetchArtwork()
  }, [id, router, supabase])

  const handleChange = (e) => {
    const { name, value } = e.target
    setFormData((prev) => ({ ...prev, [name]: value }))
  }
// Función helper para formatear la URL de la imagen
const getFormattedImageUrl = (url) => {
  if (!url) return ''
  if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
    return url
  }
  return `/${url}`
}


  const handleSubmit = async (e) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')
    setSuccessMsg('')

    const updatePayload = {
      title: formData.title,
      series: formData.series,
      medium: formData.medium,
      year: Number(formData.year),
      base_price_mxn: formData.base_price_mxn ? Number(formData.base_price_mxn) : null,
      dimensions: formData.dimensions,
      ownership_status: formData.ownership_status,
      primary_image_url: formData.primary_image_url,
      description: formData.description,
      updated_at: new Date().toISOString()
    }

    const { error } = await supabase
      .from('artworks')
      .update(updatePayload)
      .eq('id', id)

    if (error) {
      setErrorMsg('Error al actualizar obra: ' + error.message)
    } else {
      setSuccessMsg('Obra actualizada correctamente.')
      window.scrollTo({ top: 0, behavior: 'smooth' })
    }

    setSaving(false)
  }

  if (loading) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-xs font-mono text-neutral-500">
        Cargando datos de la obra...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 sm:p-12">
      <div className="max-w-2xl mx-auto space-y-8">
        <div className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <div>
            <Link
              href="/admin/artworks"
              className="text-[10px] font-mono text-amber-500 hover:underline uppercase tracking-widest block mb-1"
            >
              ← Volver al Inventario
            </Link>
            <h1 className="text-2xl font-serif font-light text-white">Editar Obra</h1>
          </div>
        </div>

        {errorMsg && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-4 text-xs font-mono text-red-300">
            🚨 {errorMsg}
          </div>
        )}

        {successMsg && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-xl p-4 text-xs font-mono text-emerald-300">
            ✅ {successMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-6 bg-neutral-900/40 border border-neutral-800 p-6 rounded-2xl">
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
            <div>
              <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Título</label>
              <input
                type="text"
                name="title"
                value={formData.title}
                onChange={handleChange}
                required
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Serie</label>
              <select
                name="series"
                value={formData.series}
                onChange={handleChange}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="DECO">DECO</option>
                <option value="FLOW">FLOW</option>
                <option value="ORBITALS">ORBITALS</option>
                <option value="ART TOYS">ART TOYS</option>
                <option value="EDICIÓN ESPECIAL">EDICIÓN ESPECIAL</option>
              </select>
            </div>
          </div>

          <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
            <div>
              <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Precio Base (MXN)</label>
              <input
                type="number"
                name="base_price_mxn"
                value={formData.base_price_mxn}
                onChange={handleChange}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Año</label>
              <input
                type="number"
                name="year"
                value={formData.year}
                onChange={handleChange}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              />
            </div>

            <div>
              <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Estatus</label>
              <select
                name="ownership_status"
                value={formData.ownership_status}
                onChange={handleChange}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              >
                <option value="AVAILABLE">AVAILABLE</option>
                <option value="RESERVED">RESERVED</option>
                <option value="CLAIMED">CLAIMED</option>
              </select>
            </div>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Técnica / Medio</label>
            <input
              type="text"
              name="medium"
              value={formData.medium}
              onChange={handleChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Dimensiones</label>
            <input
              type="text"
              name="dimensions"
              value={formData.dimensions}
              onChange={handleChange}
              placeholder="e.g. 50 x 70 cm"
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">URL Imagen Principal</label>
           <ImageUploader
    currentUrl={getFormattedImageUrl(formData.primary_image_url)}
    onUploadComplete={(url) => setFormData((prev) => ({ ...prev, primary_image_url: url }))}
  />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-neutral-400 mb-1">Descripción</label>
            <textarea
              name="description"
              rows={3}
              value={formData.description}
              onChange={handleChange}
              className="w-full bg-neutral-950 border border-neutral-800 rounded-lg p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
            />
          </div>

          <button
            type="submit"
            disabled={saving}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-mono font-bold text-xs rounded-lg transition"
          >
            {saving ? 'Guardando Cambios...' : 'Guardar Cambios'}
          </button>
        </form>
      </div>
    </div>
  )
}