'use client'

import { useRef, useState } from 'react'
import { Button, FileUploaderDropContainer, InlineLoading, Tag, TextInput, Tile } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import PrintGallery from '@/components/media/PrintGallery'
import OptimizedImg from '@/components/media/OptimizedImg'
import { authHeaders } from '@/lib/authHeaders'
import { LEGACY_PRINT_PREVIEW, PRINT_GALLERY_LIMIT, PRINT_GALLERY_UPLOAD_LIMIT, printGalleryImages } from '@/lib/printGallery'
import styles from './PrintManager.module.css'

export default function PrintGalleryEditor({ id, variant, onRefresh }) {
  const { t, lang } = useI18n()
  const [images, setImages] = useState(() => variant.gallery_images?.length ? variant.gallery_images : [LEGACY_PRINT_PREVIEW])
  const [revision, setRevision] = useState(variant.gallery_revision ?? 0)
  const [dirty, setDirty] = useState(false)
  const [busy, setBusy] = useState(false)
  const [notice, setNotice] = useState(null)
  const inFlight = useRef(false)
  const title = t('Galería del print', 'Print Gallery')
  const preview = printGalleryImages(images, variant.thumbnail, lang)

  function change(next) {
    setImages(next)
    setDirty(true)
    setNotice(null)
  }

  function move(from, to) {
    const next = [...images]
    next.splice(to, 0, next.splice(from, 1)[0])
    change(next)
  }

  async function request(body) {
    if (inFlight.current) return null
    inFlight.current = true
    setBusy(true)
    setNotice(null)
    try {
      const response = await fetch('/api/admin/prints', {
        method: 'PUT',
        headers: {
          ...await authHeaders(),
          ...(typeof body === 'string' ? { 'Content-Type': 'application/json' } : {}),
        },
        body,
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error)
      return result
    } catch (error) {
      const conflict = error.message === 'print_gallery_conflict'
      if (conflict) onRefresh()
      setNotice({ error: conflict
        ? t('La galería cambió. Vuelve a abrir la variante para editar la versión actual.', 'The gallery changed. Reopen the variant to edit the current version.')
        : t('No se pudo completar el cambio. Comprueba la imagen e inténtalo de nuevo.', 'The change could not be completed. Check the image and try again.') })
      return null
    } finally {
      inFlight.current = false
      setBusy(false)
    }
  }

  async function upload(file, replaceIndex) {
    if (!file || inFlight.current) return
    if (file.size > PRINT_GALLERY_UPLOAD_LIMIT) {
      setNotice({ error: t('La imagen supera 4 MB.', 'The image exceeds 4 MB.') })
      return
    }
    const body = new FormData()
    body.append('id', id)
    body.append('file', file)
    const result = await request(body)
    if (!result) return
    if (replaceIndex == null) change([...images, { url: result.url, alt_es: '', alt_en: '' }])
    else change(images.map((entry, index) => index === replaceIndex ? { ...entry, url: result.url } : entry))
  }

  async function save() {
    const result = await request(JSON.stringify({ id, images, revision }))
    if (!result) return
    setRevision(result.gallery_revision)
    setDirty(false)
    setNotice({ saved: true })
    onRefresh()
  }

  return (
    <Tile className={styles.galleryEditor}>
      <h3>{title}</h3>
      <p>{t(`${preview.length} imágenes en la galería`, `${preview.length} images in the gallery`)}</p>
      {!images.length && variant.thumbnail && <p>{t('Se mostrará la vista previa existente.', 'The existing preview will be displayed.')}</p>}
      <p>{t('Formatos JPG, PNG y WebP de hasta 4 MB.', 'JPG, PNG and WebP up to 4 MB.')}</p>
      <fieldset disabled={busy} className={styles.fieldset}>
        {images.map((entry, index) => {
          const url = entry.url || variant.thumbnail
          return (
            <div key={entry.url || 'existing'} className={styles.galleryCard}>
              {url && <OptimizedImg src={url} variant="thumbnail" sizes="120px" alt="" />}
              <div className={styles.fieldset}>
                {index === 0 && <Tag type="blue">{t('Principal', 'Primary')}</Tag>}
                {!entry.url && <p>{t('Vista previa existente', 'Existing preview')}</p>}
                <div className={styles.actions}>
                  {index !== 0 && <Button type="button" size="sm" kind="ghost" onClick={() => move(index, 0)}>
                    {t('Hacer principal', 'Set as primary')}
                  </Button>}
                  <Button type="button" size="sm" kind="ghost" disabled={index < 2} onClick={() => move(index, index - 1)}>
                    {t('Subir', 'Move up')}
                  </Button>
                  <Button type="button" size="sm" kind="ghost" disabled={index === 0 || index === images.length - 1}
                    onClick={() => move(index, index + 1)}>
                    {t('Bajar', 'Move down')}
                  </Button>
                  <Button type="button" size="sm" kind="danger--ghost" onClick={() => change(images.filter((_, item) => item !== index))}>
                    {t('Quitar', 'Remove')}
                  </Button>
                </div>
                {[['alt_es', t('Texto alternativo en español', 'Spanish alt text')], ['alt_en', t('Texto alternativo en inglés', 'English alt text')]]
                  .map(([field, label]) => <TextInput key={field} id={`print-gallery-${index}-${field}`}
                    labelText={label} value={entry[field]} maxLength={250}
                    onChange={event => change(images.map((image, item) => item === index ? { ...image, [field]: event.target.value } : image))} />)}
                <FileUploaderDropContainer name={`replace-gallery-image-${index}`} accept={['image/jpeg', 'image/png', 'image/webp']}
                  labelText={t('Reemplazar imagen', 'Replace image')}
                  onAddFiles={(_event, { addedFiles }) => upload(addedFiles[0], index)} />
              </div>
            </div>
          )
        })}
        {images.length < PRINT_GALLERY_LIMIT && <FileUploaderDropContainer name="add-gallery-image"
          labelText={t('Agregar imagen', 'Add image')} accept={['image/jpeg', 'image/png', 'image/webp']}
          onAddFiles={(_event, { addedFiles }) => upload(addedFiles[0])} />}
        <Button type="button" disabled={!dirty || busy} onClick={save}>{t('Guardar galería', 'Save gallery')}</Button>
        {busy && <InlineLoading description={t('Procesando…', 'Processing…')} />}
        {notice?.error && <p role="alert">{notice.error}</p>}
        {notice?.saved && <p role="status">{t('Galería guardada.', 'Gallery saved.')}</p>}
      </fieldset>
      {preview.length > 0 && <details className={styles.galleryPreview}>
        <summary>{t('Vista previa para clientes', 'Customer preview')}</summary>
        <PrintGallery images={preview} title={title} />
      </details>}
    </Tile>
  )
}
