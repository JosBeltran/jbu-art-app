'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import Image from 'next/image'
import CreateSeriesModal from '@/components/CreateSeriesModal'

export default function NewArtworkPage() {
  const router = useRouter()


  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successData, setSuccessData] = useState(null)

  const [seriesList, setSeriesList] = useState([])
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [series, setSeries] = useState('DECO')
  const [seriesNumber, setSeriesNumber] = useState('')
  const [medium, setMedium] = useState('Acrílico y resina epóxica sobre madera')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [dimensions, setDimensions] = useState('30 x 30 x 4 cm')
  const [basePrice, setBasePrice] = useState('')
  const [acceptsPrints, setAcceptsPrints] = useState(false) // 👈 Estado para Prints
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  useEffect(() => {
    const initPage = async () => {
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

      const { data: seriesData } = await supabase
        .from('series')
        .select('id, title')
        .order('title', { ascending: true })

      if (seriesData && seriesData.length > 0) {
        setSeriesList(seriesData)
        setSeries(seriesData[0].title.toUpperCase())
      } else {
        const defaultSeries = [
          { id: '1', title: 'DECO' },
          { id: '2', title: 'FLOW' },
          { id: '3', title: 'ORBITALS' },
          { id: '4', title: 'ART TOYS' },
          { id: '5', title: 'EDICIÓN ESPECIAL' }
        ]
        setSeriesList(defaultSeries)
        setSeries('DECO')
      }

      setCheckingAuth(false)
    }

    initPage()
  }, [router, supabase])

  const handleSeriesCreated = (newSeries) => {
    const formattedTitle = newSeries.title.toUpperCase()
    setSeriesList((prev) =>
      [...prev, { id: newSeries.id, title: formattedTitle }].sort((a, b) =>
        a.title.localeCompare(b.title)
      )
    )
    setSeries(formattedTitle)
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

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

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setSuccessData(null)

    try {
      const formattedNumber = seriesNumber.toString().padStart(2, '0')
      const cleanSeriesPrefix = series.replace(/\s+/g, '').toUpperCase()
      const sku = `${cleanSeriesPrefix}-${formattedNumber}`.toLowerCase()

      const { data: existingSku } = await supabase
        .from('artworks')
        .select('id')
        .ilike('sku', sku)
        .maybeSingle()

      if (existingSku) {
        throw new Error(`El SKU "${sku.toUpperCase()}" ya se encuentra registrado. Elige otro número de serie.`)
      }

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

      const claimToken = generateClaimToken()

      const newArtworkData = {
        title: title.trim(),
        sku: sku.toLowerCase(),
        series: series,
        medium: medium.trim(),
        year: parseInt(year, 10) || new Date().getFullYear(),
        dimensions: dimensions.trim(),
        base_price_mxn: basePrice ? parseFloat(basePrice) : null,
        allows_prints: acceptsPrints, // 👈 Se guarda en la DB
        description: description.trim(),
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

      setTitle('')
      setSeriesNumber('')
      setDescription('')
      setAcceptsPrints(false)
      setImageFile(null)
      setImagePreview(null)

    } catch (err) {
      setErrorMsg(err.message || 'Ocurrió un error al guardar la obra.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className="min-h-screen bg-violet-950 flex items-center justify-center text-xs font-mono text-violet-500">
        Verificando credenciales de administrador...
      </div>
    )
  }

  return (
    <div className="min-h-screen bg-violet-950 text-violet-100 font-sans p-6 sm:p-12">
      <div className="max-w-3xl mx-auto space-y-8">
        
        <div className="flex items-center justify-between border-b border-violet-800 pb-6">
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
            className="text-xs font-mono text-violet-400 hover:text-white transition bg-violet-900 border border-violet-800 px-3 py-1.5 rounded-lg"
          >
            ← Volver al Inventario
          </Link>
        </div>

        {successData && (
          <div className="bg-emerald-950/60 border border-emerald-500/40 rounded-2xl p-6 space-y-4 font-mono text-xs text-emerald-200">
            <div className="flex items-center justify-between border-b border-emerald-500/30 pb-3">
              <span className="font-bold text-sm text-emerald-400">✅ ¡Obra Registrada Exitosamente!</span>
              <span className="text-emerald-400 font-bold bg-emerald-900/80 px-2.5 py-1 rounded-md">
                SKU: {successData.sku?.toUpperCase()}
              </span>
            </div>

            <p className="text-emerald-300 font-sans">
              La obra <strong>"{successData.title}"</strong> fue agregada al catálogo.
            </p>

            <div className="bg-violet-950 p-4 rounded-xl border border-emerald-500/30 text-center space-y-1">
              <span className="text-[10px] text-violet-500 uppercase tracking-widest">Código Secreto de Reclamación</span>
              <p className="text-2xl text-amber-400 font-bold tracking-wider select-all">
                {successData.claim_token}
              </p>
            </div>

            <div className="pt-2 flex gap-3">
              <Link
                href={`/verify/${encodeURIComponent(successData.sku)}`}
                className="px-4 py-2 bg-emerald-500 text-violet-950 font-bold rounded-lg hover:bg-emerald-400 transition"
              >
                Ver Certificado Público ↗
              </Link>
              <button
                onClick={() => setSuccessData(null)}
                className="px-4 py-2 bg-violet-900 text-violet-300 rounded-lg border border-violet-800 hover:bg-violet-800 transition"
              >
                Registrar Otra Obra
              </button>
            </div>
          </div>
        )}

        {errorMsg && (
          <div className="bg-red-950/60 border border-red-500/40 rounded-xl p-4 text-xs font-mono text-red-300">
            🚨 {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="bg-violet-900/40 border border-violet-800 rounded-2xl p-6 sm:p-8 space-y-6">
          
          <div className="space-y-2">
            <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
              Fotografía de la Obra
            </label>

            <div className="flex flex-col sm:flex-row gap-6 items-center">
              <div className="w-full sm:w-48 h-48 bg-violet-950 border border-dashed border-violet-700 rounded-xl overflow-hidden relative flex items-center justify-center shrink-0">
                {imagePreview ? (
                  <Image
                    src={imagePreview}
                    alt="Preview"
                    fill
                    className="object-cover"
                  />
                ) : (
                  <div className="text-center p-4 font-mono text-[10px] text-violet-600">
                    [ Vista previa ]
                  </div>
                )}
              </div>

              <div className="space-y-2 w-full">
                <input
                  type="file"
                  accept="image/*"
                  onChange={handleImageChange}
                  className="block w-full text-xs text-violet-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-mono file:bg-violet-800 file:text-amber-400 hover:file:bg-violet-700 file:cursor-pointer"
                />
              </div>
            </div>
          </div>

          <hr className="border-violet-800" />

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-6">
            
            <div className="sm:col-span-2 space-y-1">
              <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
                Título de la Obra *
              </label>
              <input
                type="text"
                required
                placeholder="Ej. Interior Signal, Orbital Node #1, etc."
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="space-y-1">
              <div className="flex items-center justify-between">
                <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
                  Colección / Serie *
                </label>
                <button
                  type="button"
                  onClick={() => setIsSeriesModalOpen(true)}
                  className="text-[11px] font-mono text-amber-500 hover:text-amber-400 underline"
                >
                  + Crear Serie
                </button>
              </div>
              <select
                value={series}
                onChange={(e) => setSeries(e.target.value)}
                className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
              >
                {seriesList.map((s) => (
                  <option key={s.id} value={s.title.toUpperCase()}>
                    {s.title.toUpperCase()}
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
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
                  className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
                />
              </div>
              <p className="text-[10px] font-mono text-violet-500">
                SKU: {series.replace(/\s+/g, '')}-{seriesNumber ? seriesNumber.toString().padStart(2, '0') : 'XX'}
              </p>
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
                Técnica / Medio *
              </label>
              <input
                type="text"
                required
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
                className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
                Año *
              </label>
              <input
                type="number"
                required
                value={year}
                onChange={(e) => setYear(e.target.value)}
                className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
                Dimensiones
              </label>
              <input
                type="text"
                placeholder="Ej. 30 x 30 x 4 cm"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
                className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition"
              />
            </div>

            <div className="space-y-1">
              <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
                Precio Base ($ MXN)
              </label>
              <input
                type="number"
                placeholder="Ej. 8500"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
                className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 transition font-mono"
              />
            </div>

          </div>

          {/* 👈 Toggle/Checkbox para Habilitar Prints */}
          <div className="bg-violet-950 border border-violet-800 p-4 rounded-xl flex items-center justify-between">
            <div>
              <label htmlFor="acceptsPrints" className="text-xs font-mono font-bold text-amber-400 cursor-pointer uppercase">
                Disponible para Impresiones / Prints
              </label>
              <p className="text-[10px] font-mono text-violet-500">
                Habilita opciones de compra de reproducciones en el catálogo público.
              </p>
            </div>
            <input
              type="checkbox"
              id="acceptsPrints"
              checked={acceptsPrints}
              onChange={(e) => setAcceptsPrints(e.target.checked)}
              className="w-5 h-5 accent-amber-500 cursor-pointer rounded"
            />
          </div>

          <div className="space-y-1">
            <label className="block text-xs font-mono text-violet-400 uppercase tracking-wider">
              Descripción
            </label>
            <textarea
              rows={3}
              placeholder="Detalles sobre la pieza, concepto o acabado..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-violet-950 border border-violet-800 rounded-xl p-3 text-xs font-mono text-white focus:border-amber-500 focus:outline-none transition"
            />
          </div>

          <hr className="border-violet-800" />

          <button
            type="submit"
            disabled={loading}
            className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:bg-violet-800 disabled:text-violet-500 text-violet-950 font-mono font-bold text-xs rounded-xl shadow transition" 
          >
            {loading ? 'Guardando obra...' : '✨ Registrar Obra y Generar Claim Token'}
          </button>

        </form>

      </div>

      <CreateSeriesModal
        isOpen={isSeriesModalOpen}
        onClose={() => setIsSeriesModalOpen(false)}
        onSeriesCreated={handleSeriesCreated}
      />
    </div>
  )
}