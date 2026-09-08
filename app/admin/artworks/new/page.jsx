'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { createBrowserClient } from '@supabase/ssr'
import Link from 'next/link'
import Image from 'next/image'

export default function NewArtworkPage() {
  const router = useRouter()
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successData, setSuccessData] = useState(null)

  // VALIDACIÓN DE SEGURIDAD / AUTENTICACIÓN
  useEffect(() => {
    const verifyAdmin = async () => {
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

      setCheckingAuth(false)
    }

    verifyAdmin()
  }, [router, supabase])

  // CAMPOS DEL FORMULARIO
  const [title, setTitle] = useState('')
  const [series, setSeries] = useState('DECO')
  const [seriesNumber, setSeriesNumber] = useState('')
  const [medium, setMedium] = useState('Acrílico y resina epóxica sobre madera')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [dimensions, setDimensions] = useState('30 x 30 x 4 cm')
  const [basePrice, setBasePrice] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-neutral-950 flex items-center justify-center text-xs font-mono text-neutral-500">
        Verificando credenciales de administrador...
      </div>
    )
  }

  // Manejar previsualización de imagen
  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  // Generador de Claim Token aleatorio único (ej. JBU-8K9P-2M)
  const generateClaimToken = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    let result = 'JBU-'
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    result += '-'
    for (let i = 0; i < 2; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  // SUBMIT DEL FORMULARIO
  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setSuccessData(null)

    try {
      // 1. Validar SKU
      const formattedNumber = seriesNumber.toString().padStart(2, '0')
      const sku = `${series}-${formattedNumber}`.toLowerCase()

      const { data: existingSku } = await supabase
        .from('artworks')
        .select('id')
        .ilike('sku', sku)
        .maybeSingle()

      if (existingSku) {
        throw new Error(`El SKU "${sku.toUpperCase()}" ya se encuentra registrado. Elige otro número de serie.`)
      }

      // 2. Subir imagen a Supabase Storage (si existe)
      let primaryImageUrl = null
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop()
        const fileName = `${sku}-${Date.now()}.${fileExt}`
        const filePath = `artwork-images/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('artworks')
          .upload(filePath, imageFile, { upsert: true })

        if (uploadError) {
          throw new Error(`Error al subir imagen: ${uploadError.message}`)
        }

        const { data: publicUrlData } = supabase.storage
          .from('artworks')
          .getPublicUrl(filePath)

        primaryImageUrl = publicUrlData.publicUrl
      }

      // 3. Generar Claim Token
      const claimToken = generateClaimToken()

      // 4. Insertar la obra en la tabla artworks con nombres de campos exactos
      const newArtworkData = {
        title: title.trim(),
        sku: sku.toLowerCase(),
        series: series,
        medium: medium.trim(),
        year: parseInt(year, 10) || new Date().getFullYear(),
        dimensions: dimensions.trim(),
        base_price_mxn: basePrice ? parseFloat(basePrice) : null,
        primary_image_url: primaryImageUrl,
        claim_token: claimToken,
        ownership_status: 'AVAILABLE',
        created_at: new Date().toISOString()
      }

      const { data: insertedArt, error: insertError } = await supabase
        .from('artworks')
        .insert([newArtworkData])
        .select()
        .single()

      if (insertError) {
        throw new Error(`Error al registrar obra en Supabase: ${insertError.message}`)
      }

      setSuccessData({
        ...insertedArt,
        claim_token: claimToken
      })

      // Resetear formulario básico
      setTitle('')
      setSeriesNumber('')
      setImageFile(null)
      setImagePreview(null)

    } catch (err) {
      setErrorMsg(err.message || 'Ocurrió un error al guardar la obra.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="min-h-screen bg-neutral-950 text-neutral-100 font-sans p-6 sm:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        
        {/* ENCABEZADO */}
        <div className="flex items-center justify-between border-b border-neutral-800 pb-6">
          <div>
            <p className="text-[10px] font-mono text-amber-500 uppercase tracking-widest">
              Panel Administrativo — Estudio JBU
            </p>
            <h1 className="text-2xl font-serif font-light text-white">
              Alta de Nueva Obra / Pieza
            </h1>
          </div>

          <Link
            href="/admin/artworks"
            className="text-xs font-mono text-neutral-400 hover:text-white transition bg-neutral-900 border border-neutral-800 px-3 py-1.5 rounded-lg"
          >
            ← Volver al Inventario
          </Link>
        </div>

        {/* MENSAJE DE ÉXITO Y CLAIM TOKEN GENERADO */}
        {successData && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-6 space-y-4 font-mono text-xs text-emerald-200">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
              <span className="font-bold text-sm text-emerald-400">✅ ¡Obra Registrada Exitosamente!</span>
              <span className="text-emerald-400 font-bold bg-emerald-900/80 px-2.5 py-1 rounded-md">
                SKU: {successData.sku?.toUpperCase()}
              </span>
            </div>

            <p className="text-emerald-300 font-sans">
              La obra <strong>"{successData.title}"</strong> fue agregada al catálogo. Guarda el código de reclamación para entregar al comprador o imprimir en el reverso de la pieza:
            </p>

            <div className="bg-neutral-950 p-4 rounded-xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-[10px] text-neutral-500 uppercase tracking-widest">Código Secreto de Reclamación (Claim Token)</span>
              <p className="text-2xl text-amber-400 font-bold tracking-wider select-all">
                {successData.claim_token}
              </p>
              <p className="text-[10px] text-neutral-400">
                Comparte este código únicamente con el comprador final para que pueda reclamar la propiedad en <code className="text-amber-500">estudiojbu.com/claim</code>.
              </p>
            </div>

            <div className="pt-2 flex gap-3">
              <Link
                href={`/verify/${encodeURIComponent(successData.sku)}`}
                className="px-4 py-2 bg-emerald-500 text-neutral-950 font-bold rounded-lg hover:bg-emerald-400 transition"
              >
                Ver Certificado Público ↗
              </Link>
              <button
                onClick={() => setSuccessData(null)}
                className="px-4 py-2 bg-neutral-900 text-neutral-300 rounded-lg border border-neutral-800 hover:bg-neutral-800 transition"
              >
                Registrar Otra Obra
              </button>
            </div>
          </div>
        )}

        {/* MENSAJE DE ERROR */}
        {errorMsg && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-4 text-xs font-mono text-red-300">
            🚨 {errorMsg}
          </div>
        )}

        {/* FORMULARIO */}
        <form onSubmit={handleSubmit} className="bg-neutral-900/40 border border-neutral-800 rounded-2xl p-6 sm:p-8 space-y-6">
          
          {/* FOTO DE LA OBRA */}
          <div className="space-y-2">
            <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
              Fotografía de la Obra
            </label>

            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="w-full sm:w-48 h-48 bg-neutral-950 border border-dashed border-neutral-700 rounded-xl overflow-hidden relative flex items-center justify-center shrink-0">
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="text-center p-4 font-mono text-[10px] text-neutral-600">
                    [ Vista previa ]
                  </div>
                )}
              </div>

              <div className="space-y-2 w-full">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="block w-full text-xs text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-neutral-800 file:text-amber-400 hover:file:bg-neutral-700 file:cursor-pointer"
                />
                <p className="text-[11px] text-neutral-500 leading-normal">
                  Sube una fotografía nítida. Se almacenará en Supabase Storage y se mostrará en el Certificado Digital de Autenticidad y Ficha Pública.
                </p>
              </div>
            </div>
          </div>

          <hr className="border-neutral-800" />

          {/* DATOS BÁSICOS */}
          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            {/* Título */}
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Título de la Obra *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Interior Signal, Orbital Node #1, etc."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* Colección / Serie */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Colección / Serie *
              </label>
              <select
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
              >
                <option value="DECO">DECO</option>
                <option value="FLOW">FLOW</option>
                <option value="ORBITALS">ORBITALS</option>
                <option value="ARTTOYS">ART TOYS</option>
                <option value="SPECIAL">EDICIÓN ESPECIAL</option>
              </select>
            </div>

            {/* Número de Serie */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Número de Pieza *
              </label>
              <div className="flex items-center gap-2">
                <span className="font-mono text-sm text-amber-500">{series}-</span>
                <input
                  type="number"
                  required
                  min="1"
                  placeholder="ej. 4"
                  value={seriesNumber}
                  onChange={(e) => setSeriesNumber(e.target.value)}
                  className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
                />
              </div>
              <p className="text-[10px] font-mono text-neutral-500">Generará el SKU: {series}-{seriesNumber ? seriesNumber.toString().padStart(2, '0') : 'XX'}</p>
            </div>

            {/* Técnica / Medio */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Técnica / Medio *
              </label>
              <input
                type="text"
                required
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* Año de Creación */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Año *
              </label>
              <input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>

            {/* Dimensiones */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Dimensiones
              </label>
              <input
                type="text"
                placeholder="Ej. 30 x 30 x 4 cm"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            {/* Precio Base ($ MXN) */}
            <div className="space-y-1">
              <label className="block text-xs font-mono text-neutral-400 uppercase tracking-wider">
                Precio Base ($ MXN)
              </label>
              <input
                type="number"
                placeholder="Ej. 8500"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full bg-neutral-950 border border-neutral-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>

          </div>

          <hr className="border-neutral-800" />

          {/* BOTÓN DE GUARDADO */}
          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-neutral-800 disabled:text-neutral-500 text-neutral-950 font-mono font-bold text-xs rounded-xl shadow transition" 
          >
            {loading ? 'Guardando obra y generando Claim Token...' : '✨ Registrar Obra y Generar Claim Token'}
          </button>

        </form>

      </div>
    </div>
  )
}