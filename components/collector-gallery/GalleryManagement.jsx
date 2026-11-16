'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, Checkbox, InlineLoading, Select, SelectItem, TextInput } from '@carbon/react'
import { authHeaders } from '@/lib/authHeaders'
import { useI18n } from '@/components/I18nProvider'
import styles from './CollectorGallery.module.css'

const selectCategory = (t, id, value) => (
  <Select id={id + '-category'} name="category" labelText={t('Categoría', 'Category')} defaultValue={value || 'private'}>
    <SelectItem value="private" text={t('Colección privada', 'Private Collection')} />
    <SelectItem value="studio" text={t('Estudio', 'Studio')} />
    <SelectItem value="public" text={t('Espacio público', 'Public Space')} />
  </Select>
)

function EntryFields({ admin, artworks, entry, id }) {
  const { t } = useI18n()
  return <>
    <TextInput id={id + '-es'} name="caption_es" labelText={t('Descripción en español', 'Spanish caption')} maxLength={300} defaultValue={entry?.caption_es} />
    <TextInput id={id + '-en'} name="caption_en" labelText={t('Descripción en inglés', 'English caption')} maxLength={300} defaultValue={entry?.caption_en} />
    {admin ? <>
      <TextInput id={id + '-artwork'} name="artwork_id" labelText={t('ID de la obra (opcional)', 'Artwork ID (optional)')} defaultValue={entry?.artwork_id || ''} />
      {selectCategory(t, id, entry?.category)}
      <TextInput id={id + '-order'} name="display_order" type="number" min={-999999} max={999999}
        labelText={t('Orden de presentación', 'Display order')} defaultValue={entry?.display_order ?? 0} />
      {entry && <Checkbox id={id + '-featured'} name="featured" defaultChecked={entry.featured} labelText={t('Destacar foto', 'Feature photo')} />}
    </> : artworks.length > 0 && (
      <Select id={id + '-artwork'} name="artwork_id" labelText={t('Vincular una obra de mi colección (opcional)', 'Link an artwork from my collection (optional)')}>
        <SelectItem value="" text={t('Sin obra vinculada', 'No linked artwork')} />
        {artworks.map(item => <SelectItem key={item.id} value={item.id} text={t(item.title || item.title_en, item.title_en || item.title)} />)}
      </Select>
    )}
  </>
}

function statusLabel(status, t) {
  return {
    DRAFT: t('Borrador', 'Draft'), PENDING: t('Pendiente de revisión', 'Pending review'),
    APPROVED: t('Aprobada', 'Approved'), REJECTED: t('Rechazada', 'Rejected'),
    HIDDEN: t('Oculta', 'Hidden'), WITHDRAWN: t('Consentimiento retirado', 'Consent withdrawn'),
    REMOVED: t('Eliminada', 'Removed'),
  }[status]
}

function AdminEntry({ entry, run, endpoint, busy }) {
  const { t } = useI18n()
  const [preview, setPreview] = useState(null)
  const [error, setError] = useState(false)
  const [rights, setRights] = useState(false)
  useEffect(() => () => { if (preview) URL.revokeObjectURL(preview) }, [preview])
  const patch = (action, fields = {}) => run('PATCH', { id: entry.id, action, ...fields })
  const terminal = ['WITHDRAWN', 'REMOVED'].includes(entry.status)
  async function show() {
    setError(false)
    try {
      const response = await fetch(`${endpoint}?id=${entry.id}&variant=full`, { headers: await authHeaders() })
      if (!response.ok) throw new Error()
      setPreview(URL.createObjectURL(await response.blob()))
    } catch { setError(true) }
  }
  return <article className={styles.entry}>
    <h3>{statusLabel(entry.status, t)}{entry.visible && ' · ' + t('Publicada', 'Published')}</h3>
    {entry.legacy_path && <p>{entry.legacy_path}</p>}
    {entry.status !== 'REMOVED' && !preview && <Button kind="ghost" size="sm" onClick={show}>{t('Ver foto', 'View photo')}</Button>}
    {error && <p role="status">{t('Foto no disponible', 'Photo unavailable')}</p>}
    {preview && (
      // eslint-disable-next-line @next/next/no-img-element
      <img src={preview} alt={t(entry.caption_es || 'Foto enviada', entry.caption_en || 'Submitted photo')} />
    )}
    {!terminal && <>
      <form className={styles.stack} onSubmit={event => {
        event.preventDefault()
        const form = new FormData(event.currentTarget)
        void patch('edit', { ...Object.fromEntries(form), featured: form.has('featured') })
      }}>
        <EntryFields admin entry={entry} id={entry.id} />
        <div><Button size="sm" type="submit" disabled={busy}>{t('Guardar cambios', 'Save changes')}</Button></div>
      </form>
      <Checkbox id={entry.id + '-rights'} labelText={t('Confirmo los permisos de publicación y revisé la foto y sus descripciones.', 'I confirmed publication rights and reviewed the photo and captions.')}
        checked={rights} onChange={(_, { checked }) => setRights(checked)} />
      <div className={styles.actions}>
        {entry.status !== 'APPROVED' && <Button size="sm" disabled={busy || !rights} onClick={() => patch('approve', { rights_confirmed: rights })}>{t('Aprobar', 'Approve')}</Button>}
        <Button size="sm" kind="secondary" disabled={busy || entry.status !== 'APPROVED' || (!entry.visible && !rights)}
          onClick={() => patch(entry.visible ? 'unpublish' : 'publish', { rights_confirmed: rights })}>{entry.visible ? t('Despublicar', 'Unpublish') : t('Publicar', 'Publish')}</Button>
        {entry.status !== 'REJECTED' && <Button size="sm" kind="ghost" disabled={busy} onClick={() => patch('reject')}>{t('Rechazar', 'Reject')}</Button>}
        {entry.status !== 'HIDDEN' && <Button size="sm" kind="ghost" disabled={busy} onClick={() => patch('hide')}>{t('Ocultar', 'Hide')}</Button>}
      </div>
    </>}
    <Button kind="danger--ghost" size="sm" disabled={busy} onClick={() => {
      if (window.confirm(t('¿Eliminar la fotografía almacenada?', 'Delete the stored photo?'))) void patch('remove')
    }}>{entry.status === 'REMOVED' ? t('Reintentar borrado del archivo', 'Retry file deletion') : t('Eliminar foto', 'Delete photo')}</Button>
  </article>
}

export default function GalleryManagement({ admin = false }) {
  const { t } = useI18n()
  const endpoint = admin ? '/api/admin/collector-gallery' : '/api/collection/gallery'
  const [page, setPage] = useState(0)
  const [entries, setEntries] = useState([])
  const [artworks, setArtworks] = useState([])
  const [loading, setLoading] = useState(true)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [saved, setSaved] = useState(false)
  const refresh = useCallback(async signal => {
    const response = await fetch(`${endpoint}?page=${page}`, { headers: await authHeaders(), signal })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error)
    setEntries(admin ? result : result.entries)
    if (!admin) setArtworks(result.artworks)
  }, [endpoint, page, admin])
  useEffect(() => {
    const controller = new AbortController()
    refresh(controller.signal).catch(error => {
      if (!controller.signal.aborted) setError(error.message)
    }).finally(() => { if (!controller.signal.aborted) setLoading(false) })
    return () => controller.abort()
  }, [refresh])
  async function run(method, data) {
    setBusy(true)
    setError('')
    setSaved(false)
    try {
      const headers = await authHeaders()
      if (method === 'PATCH') headers['Content-Type'] = 'application/json'
      const response = await fetch(endpoint, { method, headers, body: method === 'POST' ? data : JSON.stringify(data) })
      if (!response.ok) {
        const result = await response.json().catch(() => ({}))
        throw new Error(result.error || (response.status === 413 ? 'photo_too_large' : 'gallery_unavailable'))
      }
      await refresh()
      setSaved(true)
      return true
    } catch (error) { setError(error.message); return false }
    finally { setBusy(false) }
  }
  const errors = {
    photo_too_large: t('La foto debe pesar hasta 4 MB.', 'The photo must be 4 MB or smaller.'),
    invalid_photo: t('Selecciona una foto JPG, PNG o WebP válida.', 'Select a valid JPG, PNG, or WebP photo.'),
    upload_limit: t('Alcanzaste el límite de cargas. Intenta dentro de una hora.', 'Upload limit reached. Try again in an hour.'),
    ownership_unverified: t('La obra vinculada no se pudo verificar.', 'The linked artwork could not be verified.'),
    entry_unavailable: t('La entrada cambió o ya no está disponible.', 'The entry changed or is unavailable.'),
    consent_required: t('Se requiere tu consentimiento para enviar la foto.', 'Consent is required to submit the photo.'),
  }
  return <section className={styles.panel} aria-labelledby="gallery-management-title">
    <h2 id="gallery-management-title">{admin ? t('Galería de coleccionistas', 'Collector Gallery') : t('Compartir mi espacio', 'Share My Space')}</h2>
    {!admin && <p>{t('Comparte una foto real de la obra en tu espacio. Evita mostrar rostros, direcciones u otros detalles personales. Tu nombre y los datos de tu compra se mantienen privados. Puedes retirar el consentimiento desde aquí.', 'Share a real photo of the artwork in your space. Avoid faces, addresses, and other personal details. Your name and purchase details stay private. You can withdraw consent here.')}</p>}
    <form className={styles.stack} onSubmit={async event => {
      event.preventDefault()
      const form = event.currentTarget
      if (await run('POST', new FormData(form))) form.reset()
    }}>
      <EntryFields admin={admin} artworks={artworks} id="gallery-new" />
      <label>{t('Foto JPG, PNG o WebP (hasta 4 MB)', 'JPG, PNG, or WebP photo (up to 4 MB)')}
        <input type="file" name="photo" accept="image/jpeg,image/png,image/webp" required />
      </label>
      {!admin && <Checkbox id="gallery-consent" name="consent" required labelText={t(
        'Autorizo a JBU a mostrar esta foto y sus descripciones en la galería pública después de revisarlas.',
        'I allow JBU to display this photo and its captions in the public gallery after review.'
      )} />}
      <div><Button type="submit" disabled={busy}>{admin ? t('Subir borrador', 'Upload draft') : t('Enviar para revisión', 'Submit for review')}</Button></div>
    </form>
    {error && <p role="alert">{errors[error] || t('No se pudo completar la operación. Intenta nuevamente.', 'The operation could not be completed. Try again.')}</p>}
    {saved && <p role="status">{t('Cambios guardados.', 'Changes saved.')}</p>}
    {(loading || busy) && <InlineLoading description={t('Cargando…', 'Loading…')} />}
    <div className={styles.stack}>
      {entries.map(entry => admin ? <AdminEntry key={entry.id + entry.updated_at} entry={entry} run={run} endpoint={endpoint} busy={busy} /> : (
        <article key={entry.id} className={styles.entry}>
          <h3>{statusLabel(entry.status, t)}</h3>
          <p>{t(entry.caption_es || entry.caption_en, entry.caption_en || entry.caption_es)}</p>
          {!['WITHDRAWN', 'REMOVED'].includes(entry.status) && <Button size="sm" kind="tertiary" disabled={busy}
            onClick={() => {
              if (window.confirm(t('¿Retirar tu consentimiento de publicación?', 'Withdraw your consent for publication?'))) void run('PATCH', { id: entry.id })
            }}>{t('Retirar consentimiento y solicitar eliminación', 'Withdraw consent and request removal')}</Button>}
        </article>
      ))}
    </div>
    <div className={styles.actions}>
      {page > 0 && <Button kind="ghost" onClick={() => { setLoading(true); setPage(page - 1) }}>{t('Anterior', 'Previous')}</Button>}
      {entries.length === 24 && <Button kind="ghost" onClick={() => { setLoading(true); setPage(page + 1) }}>{t('Siguiente', 'Next')}</Button>}
    </div>
  </section>
}
