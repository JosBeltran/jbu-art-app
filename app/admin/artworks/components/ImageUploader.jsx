'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Button, FileUploaderDropContainer, InlineLoading } from '@carbon/react'
import { TrashCan } from '@carbon/icons-react'
import styles from './ImageUploader.module.css'
import { useI18n } from '@/components/I18nProvider'

export default function ImageUploader({ currentUrl, onUploadComplete }) {
  const { t } = useI18n()
  const [uploading, setUploading] = useState(false)
  const [preview, setPreview] = useState(currentUrl || '')
  const [fileName, setFileName] = useState(currentUrl ? t('Imagen actual', 'Current image') : '')
  const [fileSize, setFileSize] = useState('')
  const [error, setError] = useState('')

  const uploadFile = async (file) => {
    if (!file) return

    if (!file.type.startsWith('image/')) {
      setError(t('Selecciona un archivo de imagen válido.', 'Select a valid image file.'))
      return
    }

    setUploading(true)
    setError('')
    setFileName(file.name)
    setFileSize(`${(file.size / 1024 / 1024).toFixed(1)} MB`)

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
      setError(t('No se pudo subir la imagen: ', 'Could not upload the image: ') + err.message)
    } finally {
      setUploading(false)
    }
  }

  const handleAddFiles = (_event, { addedFiles } = {}) => {
    uploadFile(addedFiles?.[0])
  }

  const handleRemove = () => {
    setPreview('')
    setFileName('')
    setFileSize('')
    setError('')
    onUploadComplete('')
  }

  return (
    <div className={styles.root}>
      <div className={styles.preview}>
        {preview ? (
          // eslint-disable-next-line @next/next/no-img-element
          <img src={preview} alt={t('Vista previa de la obra', 'Artwork preview')} className={styles.previewImage} />
        ) : (
          <span className={styles.empty}>{t('La vista previa aparecerá aquí', 'The preview will appear here')}</span>
        )}
      </div>

      <div className={styles.controls}>
        <div className={styles.dropzone}>
          <FileUploaderDropContainer
            accept={['image/jpeg', 'image/png', 'image/webp']}
            disabled={uploading}
            labelText={preview ? t('Arrastra otra imagen o pulsa para reemplazarla', 'Drag another image or click to replace it') : t('Arrastra una imagen o pulsa para seleccionarla', 'Drag an image or click to select it')}
            multiple={false}
            name="artwork-image"
            onAddFiles={handleAddFiles}
          />
        </div>

        {uploading ? (
          <InlineLoading description={t('Subiendo imagen…', 'Uploading image…')} />
        ) : (
          (fileName || preview) && (
            <div className={styles.meta}>
              <div>
                <p className={styles.fileName}>{fileName || t('Imagen actual', 'Current image')}</p>
                <p className={styles.fileDetail}>{fileSize || t('JPG, PNG o WEBP', 'JPG, PNG or WEBP')}</p>
              </div>
              <Button
                type="button"
                kind="ghost"
                size="sm"
                hasIconOnly
                renderIcon={TrashCan}
                iconDescription={t('Quitar imagen', 'Remove image')}
                onClick={handleRemove}
              />
            </div>
          )
        )}

        {error && <p className={styles.error} role="alert">{error}</p>}
      </div>
    </div>
  )
}