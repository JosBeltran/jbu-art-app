'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'

export default function CreateSeriesModal({ isOpen, onClose, onSeriesCreated }) {
  const { t } = useI18n()
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
      setErrorMsg(err.message || t('No se pudo crear la serie.', 'Could not create the series.'))
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
            {t('Crear Nueva Serie / Colección', 'Create New Series / Collection')}
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
              {t('Título de la Serie *', 'Series Title *')}
            </label>
            <input
              type="text"
              required
              placeholder={t('Ej. DECO, FLOW, ORBITALS', 'E.g. DECO, FLOW, ORBITALS')}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-sans"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-violet-400 mb-1 uppercase tracking-wider">
              {t('Descripción / Concepto', 'Description / Concept')}
            </label>
            <textarea
              rows={3}
              placeholder={t('Escribe la premisa técnica o conceptual de la serie...', 'Write the technical or conceptual premise of the series...')}
              value={description}
              onChange={(e) => setDescription(e.target.value)}
              className="w-full bg-violet-950 border border-violet-800 rounded-xl px-4 py-2.5 text-sm text-white focus:outline-none focus:border-amber-500 font-sans resize-none"
            />
          </div>

          <div>
            <label className="block text-xs font-mono text-violet-400 mb-1 uppercase tracking-wider">
              {t('URL Imagen Portada (Opcional)', 'Cover Image URL (Optional)')}
            </label>
            <input
              type="text"
              placeholder={t('https://... o /assets-optimized/...', 'https://... or /assets-optimized/...')}
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
              {t('Cancelar', 'Cancel')}
            </button>
            <button
              type="submit"
              disabled={loading || !title.trim()}
              className="px-5 py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-violet-950 font-mono text-xs font-bold rounded-xl transition"
            >
              {loading ? t('Guardando...', 'Saving...') : t('Crear Serie', 'Create Series')}
            </button>
          </div>
        </form>
      </div>
    </div>
  )
}