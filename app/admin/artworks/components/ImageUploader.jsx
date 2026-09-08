'use client'

import { useState } from 'react'
import { createBrowserClient } from '@supabase/ssr'

export default function ImageUploader({ currentUrl, onUploadComplete }) {
  const supabase = createBrowserClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
  )

  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUrl || '')
  const [error, setError] = useState('')

  const handleFileChange = async (e) => {
    const file = e.target.files?.[0]
    if (!file) return

    setUploading(true)
    setError('')

    try {
      // 1. Generar nombre único de archivo
      const fileExt = file.name.split('.').pop()
      const fileName = `${Date.now()}-${Math.random().toString(36).substring(2, 8)}.${fileExt}`
      const filePath = `artwork-images/${fileName}`

      // 2. Subir archivo al bucket 'artworks'
      const { error: uploadError } = await supabase.storage
        .from('artworks')
        .upload(filePath, file, { cacheControl: '3600', upsert: true })

      if (uploadError) throw uploadError

      // 3. Obtener URL pública
      const { data: { publicUrl } } = supabase.storage
        .from('artworks')
        .getPublicUrl(filePath)

      setPreview(publicUrl)
      onUploadComplete(publicUrl)
    } catch (err) {
      setError('Error al subir imagen: ' + err.message)
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className="space-y-3">
      <label className="block text-[10px] font-mono uppercase text-neutral-400">
        Imagen de la Obra
      </label>

      <div className="flex items-center space-x-4">
        {/* Vista previa */}
        <div className="w-20 h-20 bg-neutral-950 border border-neutral-800 rounded-xl overflow-hidden relative flex items-center justify-center shrink-0">
          {preview ? (
            <img src={preview} alt="Preview" className="w-full h-full object-cover" />
          ) : (
            <span className="text-[10px] font-mono text-neutral-600 text-center px-1">Sin Imagen</span>
          )}
        </div>

        {/* Control de archivo */}
        <div className="space-y-2 flex-1">
          <input
            type="file"
            accept="image/*"
            onChange={handleFileChange}
            disabled={uploading}
            className="block w-full text-xs font-mono text-neutral-400 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-xs file:font-mono file:font-bold file:bg-amber-500 file:text-neutral-950 hover:file:bg-amber-400 file:cursor-pointer disabled:opacity-50"
          />
          {uploading && (
            <p className="text-[10px] font-mono text-amber-500 animate-pulse">Subiendo imagen al servidor...</p>
          )}
          {error && (
            <p className="text-[10px] font-mono text-red-400">{error}</p>
          )}
        </div>
      </div>
    </div>
  )
}