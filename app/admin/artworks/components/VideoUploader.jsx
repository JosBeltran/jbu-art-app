'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button, FileUploaderDropContainer, InlineLoading, TextInput } from '@carbon/react'
import { TrashCan } from '@carbon/icons-react'
import styles from './ImageUploader.module.css'
import { useI18n } from '@/components/I18nProvider'
import { VIDEO_TYPES, MAX_VIDEO_MB } from '@/lib/artworkMedia'

/** Sube un video al bucket existente 'artworks' (carpeta artwork-videos/) o acepta una URL directa. */
export default function VideoUploader({ id, currentUrl, onChange }) {
  const { t } = useI18n()
  const [uploading, setUploading] = useState(false)
  const [error, setError] = useState('')

  const upload = async (file) => {
    if (!file) return
    setError('')
    if (!VIDEO_TYPES.includes(file.type)) {
      setError(t('Formato no compatible. Usa MP4 (H.264) o WebM.', 'Unsupported format. Use MP4 (H.264) or WebM.'))
      return
    }
    if (file.size > MAX_VIDEO_MB * 1024 * 1024) {
      setError(t(`El video supera ${MAX_VIDEO_MB} MB. Exporta una versión más corta o ligera.`, `The video exceeds ${MAX_VIDEO_MB} MB. Export a shorter or lighter version.`))
      return
    }
    setUploading(true)
    try {
      const ext = file.name.split('.').pop()
      const path = `artwork-videos/${Date.now()}-${Math.random().toString(36).slice(2, 8)}.${ext}`
      const { error: upErr } = await supabase.storage.from('artworks').upload(path, file, { cacheControl: '31536000', contentType: file.type })
      if (upErr) throw upErr
      const { data } = supabase.storage.from('artworks').getPublicUrl(path)
      onChange(data.publicUrl)
    } catch (err) {
      setError(t('No se pudo subir el video: ', 'Could not upload the video: ') + (err?.message || ''))
    } finally {
      setUploading(false)
    }
  }

  return (
    <div className={styles.root}>
      <div className={styles.preview}>
        {currentUrl ? (
          <video src={currentUrl} controls playsInline preload="metadata" className={styles.previewImage} />
        ) : (
          <span className={styles.empty}>{t('La vista previa del video aparecerá aquí', 'The video preview will appear here')}</span>
        )}
      </div>
      <div className={styles.controls}>
        <div className={styles.dropzone}>
          <FileUploaderDropContainer
            accept={VIDEO_TYPES}
            disabled={uploading}
            labelText={t('Arrastra un video (MP4/WebM) o pulsa para seleccionarlo', 'Drag a video (MP4/WebM) or click to select it')}
            multiple={false}
            name="artwork-video"
            onAddFiles={(_e, { addedFiles }) => upload(addedFiles?.[0])}
          />
        </div>
        {uploading && <InlineLoading description={t('Subiendo video…', 'Uploading video…')} />}
        <TextInput
          id={`${id}-url`}
          labelText={t('o pega la URL del video', 'or paste the video URL')}
          placeholder="https://…/video.mp4"
          value={currentUrl || ''}
          onChange={(e) => onChange(e.target.value.trim())}
        />
        {currentUrl && (
          <Button type="button" kind="ghost" size="sm" renderIcon={TrashCan} onClick={() => onChange('')}>
            {t('Quitar video', 'Remove video')}
          </Button>
        )}
        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>
  )
}
