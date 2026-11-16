'use client'

import { useId, useState } from 'react'
import { Modal, TextInput, TextArea, InlineNotification } from '@carbon/react'
import ThemedOverlay from '@/components/overlays/ThemedOverlay'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'

export default function CreateSeriesModal({ isOpen, onClose, onSeriesCreated }) {
  const id = useId()
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
    <ThemedOverlay open={isOpen} carbon initialFocus="input" onClose={onClose}>
      <Modal open={isOpen} size="sm" modalHeading={t('Crear Nueva Serie / Colección', 'Create New Series / Collection')}
        primaryButtonText={loading ? t('Guardando...', 'Saving...') : t('Crear Serie', 'Create Series')}
        secondaryButtonText={t('Cancelar', 'Cancel')} primaryButtonDisabled={loading || !title.trim()}
        closeButtonLabel={t('Cerrar', 'Close')} selectorPrimaryFocus="input" preventCloseOnClickOutside
        onRequestClose={onClose} onRequestSubmit={handleSubmit}>
        {errorMsg && <InlineNotification kind="error" hideCloseButton title={t('No se pudo crear la serie', 'Could not create the series')} subtitle={errorMsg} />}
        <form id={`series-form-${id}`} onSubmit={handleSubmit} style={{ display: 'grid', gap: '1rem' }}>
          <TextInput id={`series-title-${id}`} labelText={t('Título de la Serie', 'Series title')} required
            value={title} onChange={e => setTitle(e.target.value)} />
          <TextInput id={`series-cover-${id}`} labelText={t('URL Imagen Portada (Opcional)', 'Cover image URL (optional)')}
            placeholder={t('https://... o /assets-optimized/...', 'https://... or /assets-optimized/...')}
            value={coverImageUrl} onChange={e => setCoverImageUrl(e.target.value)} />
          <TextArea id={`series-description-${id}`} labelText={t('Descripción (Opcional)', 'Description (optional)')}
            value={description} onChange={e => setDescription(e.target.value)} />
          <button type="submit" hidden tabIndex={-1} disabled={loading || !title.trim()} />
        </form>
      </Modal>
    </ThemedOverlay>
  )
}
