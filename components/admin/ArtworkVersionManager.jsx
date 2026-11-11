'use client'

import { useEffect, useRef, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, Checkbox, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput, Tile } from '@carbon/react'
import ImageUploader from '@/app/admin/artworks/components/ImageUploader'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

async function versionRequest(id, options = {}) {
  const response = await fetch('/api/admin/artworks/' + encodeURIComponent(id) + '/versions', {
    ...options, cache: 'no-store',
    headers: { ...await authHeaders(), ...(options.body ? { 'Content-Type': 'application/json' } : {}) },
  })
  const result = await response.json().catch(() => null)
  if (!response.ok || !result) {
    throw Object.assign(new Error(result?.error || 'versions_unavailable'), { reference: result?.reference })
  }
  return result
}

export default function ArtworkVersionManager({ artworkId }) {
  const { t } = useI18n()
  const router = useRouter()
  const [data, setData] = useState(null)
  const [draft, setDraft] = useState(null)
  const [busy, setBusy] = useState(false)
  const [uploading, setUploading] = useState(false)
  const [forSale, setForSale] = useState(false)
  const [confirmPublish, setConfirmPublish] = useState(false)
  const [notice, setNotice] = useState(null)
  const submitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    versionRequest(artworkId, { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setNotice({ error: error.message, reference: error.reference })
    })
    return () => controller.abort()
  }, [artworkId])

  function errorText(code) {
    const messages = {
      version_id_conflict: t('Esta solicitud ya se guardó con otros datos. Recarga la ficha para ver el registro.', 'This request was already saved with different details. Reload to see the record.'),
      unauthorized: t('La sesión expiró. Vuelve a iniciar sesión para guardar.', 'Your session expired. Sign in again to save.'),
      invalid_version: t('Revisa el título y la nota de la versión.', 'Check the version title and note.'),
      invalid_version_event: t('El evento de procedencia ya no está disponible en esta ficha. Elige otro o guarda sin vincularlo.', 'The provenance event is no longer available for this artwork. Choose another or save without linking it.'),
      artwork_not_found: t('La ficha de origen ya no está disponible.', 'The source artwork is no longer available.'),
      version_function_missing: t('La función de guardado de versiones falta en la base de datos o aún no está disponible.', 'The version save function is missing or is not yet available in the database.'),
      version_database_permission: t('El servidor no tiene permiso para guardar versiones en la base de datos.', 'The server lacks permission to save versions in the database.'),
      version_database_constraint: t('La base de datos rechazó un campo del registro de versión.', 'The database rejected a field in the version record.'),
      version_record_conflict: t('El identificador de esta versión ya existe. Cierra el formulario y abre uno nuevo.', 'This version identifier already exists. Close the form and open a new one.'),
      successor_exists: t('Ya existe una sucesora. Ábrela en la lista para continuar.', 'A successor already exists. Open it from the list to continue.'),
      version_image_required: t('Agrega una fotografía de la versión.', 'Add a photo of this version.'),
      invalid_version_image: t('Sube una imagen JPG, PNG o WebP desde este formulario.', 'Upload a JPG, PNG or WebP image from this form.'),
      version_price_required: t('Guarda un precio público positivo en el editor antes de publicar para venta.', 'Save a positive public price in the editor before publishing for sale.'),
      version_predecessor_locked: t('La obra previa está vendida, reservada, sin publicar o tiene una venta, subasta, certificado u oferta en curso.', 'The previous work is sold, reserved, unpublished, or has a sale, auction, certificate or offer in progress.'),
      invalid_version_predecessor: t('Puedes documentar esta obra como antecedente. La sucesión comercial se permite para originales únicos vigentes.', 'You can document this artwork as history. Commercial succession is available for current unique originals.'),
      version_parent_unpublished: t('Publica la versión antes de crear otra desde ella.', 'Publish this version before creating another one from it.'),
      forbidden: t('Se requiere el rol de administrador.', 'The administrator role is required.'),
    }
    return messages[code] || t('No se pudo completar la operación. Revisa los datos e inténtalo nuevamente.', 'The operation could not be completed. Check the details and try again.')
  }

  function open(kind) {
    setNotice(null)
    setDraft({
      versionId: crypto.randomUUID(), kind, image: '', eventId: '', note: '',
      title: kind === 'SNAPSHOT'
        ? (data.artwork.title + t(' · versión anterior', ' · earlier version')).slice(0, 200) : data.artwork.title,
    })
  }

  async function persist(publishing) {
    if (submitting.current || uploading) return
    submitting.current = true
    setBusy(true)
    setNotice(null)
    try {
      const { version } = await versionRequest(artworkId, {
        method: publishing ? 'PATCH' : 'POST',
        body: JSON.stringify(publishing ? { forSale } : draft),
      })
      if (publishing) {
        window.location.reload()
        return
      }
      if (draft.kind === 'SUCCESSOR') {
        router.push('/admin/artworks/' + version.id + '/edit#artwork-versions')
        return
      }
      setDraft(null)
      setNotice({ saved: true })
      try {
        setData(await versionRequest(artworkId))
      } catch (error) {
        setNotice({ saved: true, refreshFailed: true, reference: error.reference })
      }
    } catch (error) {
      setNotice({ error: error.message, reference: error.reference })
    } finally {
      submitting.current = false
      setBusy(false)
    }
  }

  const artwork = data?.artwork
  const successorDraft = artwork?.version_kind === 'SUCCESSOR' && !artwork.version_published_at
  const hasSuccessor = data?.children.some(row => row.version_kind === 'SUCCESSOR')

  return <div className="grid gap-4">
    {notice?.error && <InlineNotification lowContrast kind="error"
      title={t('Revisa la operación', 'Check this operation')}
      subtitle={[errorText(notice.error), notice.reference && t('Referencia', 'Reference') + ' ' + notice.reference].filter(Boolean).join(' ')} />}
    {notice?.saved && <InlineNotification lowContrast kind="success" title={t('Versión anterior guardada', 'Earlier version saved')}
      subtitle={notice.refreshFailed ? t('Recarga la ficha para ver el registro.', 'Reload the page to see the saved record.') : undefined} />}
    {!data && !notice && <InlineLoading description={t('Cargando versiones…', 'Loading versions…')} />}
    {artwork && <>
      {data.parent && <p>{t('Obra de origen', 'Source artwork')} · <Link href={'/admin/artworks/' + data.parent.id + '/edit#artwork-versions'}>{data.parent.title}</Link></p>}
      {data.parent && data.linkedEvent && <p>{t('Procedencia vinculada', 'Linked provenance')} · <Link href={
        '/admin/artworks/' + data.parent.id + '/edit#provenance-event-' + data.linkedEvent.id
      }>{data.linkedEvent.title}</Link></p>}
      {successorDraft ? <Tile className="grid gap-3">
        <Tag type="gray">{t('Sucesora en borrador', 'Draft successor')}</Tag>
        <p>{t(
          'Guarda los cambios de este editor antes de publicar. Al publicar, la obra de origen quedará como versión anterior y solo podrá ofrecer sus prints.',
          'Save this editor before publishing. Publication moves the source artwork to history and leaves its prints as its only purchase option.'
        )}</p>
        <Checkbox id="publish-version-for-sale" checked={forSale} labelText={t('Poner el original de la sucesora a la venta', 'Offer the successor original for sale')}
          disabled={busy} onChange={(_event, { checked }) => setForSale(checked)} />
        <Checkbox id="publish-version-confirm" checked={confirmPublish}
          labelText={t('Confirmo el retiro de venta del original anterior', 'Confirm removal of the previous original from sale')}
          disabled={busy} onChange={(_event, { checked }) => setConfirmPublish(checked)} />
        <Button type="button" disabled={!confirmPublish || busy} onClick={() => void persist(true)}>{t('Publicar sucesora', 'Publish successor')}</Button>
      </Tile> : <>
        <div className="flex flex-wrap gap-3">
          <Button type="button" size="sm" kind="secondary" disabled={Boolean(draft)} onClick={() => open('SNAPSHOT')}>
            {t('Registrar versión anterior', 'Record an earlier version')}
          </Button>
          {!artwork.is_historical_version && !hasSuccessor &&
            <Button type="button" size="sm" kind="secondary" disabled={Boolean(draft)} onClick={() => open('SUCCESSOR')}>
              {t('Crear versión sucesora', 'Create successor version')}
            </Button>}
          <Button as="a" href="#artwork-primary-photo" size="sm" kind="ghost">
            {t('Reemplazar fotografía de esta ficha', 'Replace this record’s photo')}
          </Button>
        </div>
        <p>{t(
          'Usa el reemplazo de fotografía para corregir la imagen de esta misma ficha. Registra una versión para conservar una etapa de la obra con su propia imagen.',
          'Replace the photo to update this record. Record a version to preserve a stage of the artwork with its own image.'
        )}</p>
      </>}
      {draft && <Tile>
        <form className="grid gap-4" onSubmit={event => { event.preventDefault(); void persist(false) }}>
          <h3>{draft.kind === 'SNAPSHOT' ? t('Documentar versión anterior', 'Document an earlier version') : t('Preparar sucesora', 'Prepare successor')}</h3>
          <TextInput id="artwork-version-title" labelText={t('Título de la versión', 'Version title')} value={draft.title}
            required maxLength={200} disabled={busy} onChange={event => setDraft({ ...draft, title: event.target.value })} />
          <fieldset disabled={busy}><ImageUploader currentUrl={draft.kind === 'SNAPSHOT' ? artwork.primary_image_url || '' : ''} pathPrefix="artwork-images/versions"
            strictImageTypes onUploadStateChange={setUploading}
            onUploadComplete={url => setDraft(previous => ({ ...previous, image: url }))} /></fieldset>
          {draft.kind === 'SNAPSHOT' && <p>{t('Si omites la carga, se conserva la fotografía principal guardada de la obra.', 'If you skip the upload, the saved primary photo is used.')}</p>}
          <Select id="artwork-version-event" labelText={t('Vincular evento de procedencia (opcional)', 'Link provenance event (optional)')}
            value={draft.eventId} disabled={busy} onChange={event => setDraft({ ...draft, eventId: event.target.value })}>
            <SelectItem value="" text={t('Sin evento vinculado', 'No linked event')} />
            {data.events.map(event => <SelectItem key={event.id} value={event.id} text={[event.title, event.event_date].filter(Boolean).join(' · ')} />)}
          </Select>
          <TextArea id="artwork-version-note" labelText={t('Nota sobre esta etapa (opcional)', 'Note about this stage (optional)')}
            maxLength={2000} disabled={busy} value={draft.note} onChange={event => setDraft({ ...draft, note: event.target.value })} />
          <div className="flex flex-wrap gap-3">
            <Button type="submit" disabled={busy || uploading || (draft.kind === 'SUCCESSOR' && !draft.image)}>
              {draft.kind === 'SNAPSHOT' ? t('Guardar versión anterior', 'Save earlier version') : t('Crear borrador', 'Create draft')}
            </Button>
            <Button type="button" kind="ghost" disabled={busy || uploading} onClick={() => setDraft(null)}>{t('Cancelar', 'Cancel')}</Button>
          </div>
        </form>
      </Tile>}
      {data.children.length > 0 && <ul className="grid gap-2">
        {data.children.map(row => <li key={row.id} className="flex flex-wrap items-center gap-3">
          <Link href={'/admin/artworks/' + row.id + '/edit#artwork-versions'}>{row.title}</Link>
          <Tag type={row.is_historical_version ? 'gray' : 'purple'}>
            {row.is_historical_version ? t('Anterior', 'Earlier') : row.version_published_at ? t('Sucesora', 'Successor') : t('Borrador', 'Draft')}
          </Tag>
        </li>)}
      </ul>}
    </>}
  </div>
}
