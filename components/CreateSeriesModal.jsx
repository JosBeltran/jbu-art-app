'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function CreateSeriesModal({ isOpen, onClose, onSeriesCreated }) {
  const [title, setTitle] = useState('')
  const [description, setDescription] = useState('')
  const [coverImageUrl, setCoverImageUrl] = useState('')
  const [loading, setLoading] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')


  if (!isOpen) return null

  // Helper para generar slug a partir del título (ej. "DECO Collection" -> "deco-collection")
  const slugify = (str) =>
    str
      .toLowerCase()
      .trim()
      .replace(/[^\w\s-]/g, '')
      .replace(/[\s_-]+/g, '-')
      .replace(/^-+|-+$/g, '')

  const handleSubmit = async (e) => {
    e.preventDefault()
    if (!title.trim()) return

    setLoading(true)
    setErrorMsg('')

    try {
      const generatedSlug = `${slugify(title)}-${Date.now().toString().slice(-4)}`

      const { data, error } = await supabase
        .from('series')
        .insert([
          {
            title: title.trim(),
            slug: generatedSlug,
            description: description.trim() || null,
            cover_image_url: coverImageUrl.trim() || null,
          },
        ])
        .select()
        .single()

      if (error) throw error

      // Notificar al componente padre de la creación exitosa
      if (onSeriesCreated) {
        onSeriesCreated(data)
      }

      // Limpiar y cerrar
      setTitle('')
      setDescription('')
      setCoverImageUrl('')
      onClose()
    } catch (err) {
      console.error('Error creando serie:', err)
      setErrorMsg(err.message || 'No se pudo crear la serie.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      {/* Backdrop */}
      <div
        className="fixed inset-0 bg-black/80 backdrop-blur-sm"
        onClick={onClose}
      />

      {/* Contenido Modal */}
      <div className="relative w-full max-w-lg bg-violet-900 border border-violet-800 rounded-2xl p-6 text-violet-100 shadow-2xl z-10 space-y-6">
        <div className="flex items-center justify-between border-b border-violet-800 pb-4">
          <h2 className="text-lg font-serif font-medium text-white">
            Crear Nueva Serie / Colección
          </h2>
          <button
            onClick={onClose}
            className="text-violet-400 hover:text-white text-sm"
          >
            ✕
          </button>
        </div>

        {errorMsg && (
          <div className="p-3 bg-red-950/50 border border-red-500/40 text-red-400 text-xs rounded-xl font-mono">
            {errorMsg}
          </div>
        )}

        <form onSubmit={handleSubmit} className="space-y-4">
          <div>
            <label className="block text-xs font-mono text-violet-400 mb-1 uppercase tracking-wider">
              Título de la Serie *
            </label>
            <input
              type="text"
              required
              placeholder="Ej. DECO, FLOW, ORBITALS"
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-violet-400 mb-1 uppercase tracking-wider">
              Descripción / Concepto
            </label>
            <textarea
              rows={3}
              placeholder="Escribe la premisa técnica o conceptual de la serie..."
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-sans resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-violet-400 mb-1 uppercase tracking-wider">
              URL Imagen Portada (Opcional)
            </label>
            <input
              type="text"
              placeholder="https://... o /assets-optimized/..."
              value={coverImageUrl}
              onChange={(e) => setCoverImageUrl(e.target.value)}
              className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-mono text-xs"
            />
          </div>

          <div className="pt-4 flex justify-end gap-3 border-t border-violet-800">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-mono text-violet-400 hover:text-white transition"
            >
              Cancelar
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-violet-950 font-mono text-xs font-bold rounded-xl transition"
            >
              {loading ? 'Guardando...' : 'Crear Serie'}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}