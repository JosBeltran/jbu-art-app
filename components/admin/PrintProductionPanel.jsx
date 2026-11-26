'use client'

/* eslint-disable @next/next/no-img-element -- The admin compares bounded previews and signed masters. */
import { useEffect, useState } from 'react'
import Link from 'next/link'
import { Button, Checkbox, FileUploaderDropContainer, InlineLoading, InlineNotification, Select, SelectItem, Tag, Tile } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { supabase } from '@/lib/supabaseClient'
import { MAX_PRINT_SOURCE_BYTES, PRINT_SOURCE_TYPES } from '@/lib/printAssetPresets'
import GelatoOrderFulfillment from './GelatoOrderFulfillment'
import { uploadPrintSource } from '@/lib/printSourceUpload'

export async function requestProduction(query = '', body, signal) {
  const response = await fetch('/api/admin/print-production' + query, {
    signal, cache: 'no-store', method: body ? 'POST' : 'GET',
    headers: { ...await authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json()
  if (!response.ok) throw new Error(data.error || 'production_unavailable')
  return data
}

export function printProductionLabel(status, t) {
  return {
    PREVIEW_ONLY: t('Solo vista previa', 'Preview only'),
    MASTER_PENDING: t('Máster pendiente', 'Master pending'),
    MASTER_GENERATING: t('Generando máster', 'Generating master'),
    MASTER_READY: t('Máster generado', 'Master generated'),
    MASTER_FAILED: t('Falló la generación', 'Generation failed'),
    MASTER_STALE: t('Revisión anterior', 'Previous revision'),
    AWAITING_PREPARATION: t('Pendiente de preparación', 'Awaiting preparation'),
    AWAITING_APPROVAL: t('Pendiente de aprobación', 'Awaiting approval'),
    READY: t('Listo para producción', 'Ready for production'),
    MANUAL_REVIEW: t('Revisión manual necesaria', 'Manual review required'),
  }[status] || status
}

export function PrintLayoutSpecs({ layout, t }) {
  if (!layout?.paperWidthMm || !layout.marginsMm) return null
  const mm = value => Number(value).toFixed(1)
  return <div className="grid gap-1">
    <p>{layout.size} · {layout.paperWidthMm} × {layout.paperHeightMm} mm · {layout.paperType}</p>
    <p>{t('Área impresa', 'Printed area')} {mm(layout.artworkWidthMm)} × {mm(layout.artworkHeightMm)} mm</p>
    <p>{t('Bordes arriba / derecha / abajo / izquierda', 'Margins top / right / bottom / left')} · {
      ['top', 'right', 'bottom', 'left'].map(key => mm(layout.marginsMm[key])).join(' / ')
    } mm</p>
    <p>{layout.outputDpi} DPI · {layout.colorProfile || 'sRGB'} · {mm(layout.effectiveDpi)} {t('DPI efectivos del origen', 'effective source DPI')}</p>
    {layout.minimumEffectiveDpi != null && <p>{t('DPI efectivos mínimos', 'Minimum effective DPI')} · {mm(layout.minimumEffectiveDpi)}</p>}
  </div>
}

function errorText(code, t) {
  return {
    original_source_required: t('Para restaurar la vista previa, selecciona el archivo original exacto. Para usar otra imagen, crea una nueva revisión.', 'Select the exact original source to restore the preview. To use a different image, create a new revision.'),
    aspect_mismatch: t('La proporción de la imagen difiere de la aprobada.', 'The source aspect ratio differs from the approved image.'),
    framing_mismatch: t('El encuadre o la apariencia difiere de la vista previa aprobada.', 'Framing or appearance differs from the approved preview.'),
    invalid_provider_format: t('Gelato requiere un JPG o PNG con la orientación aplicada.', 'Gelato requires a JPG or PNG with orientation applied.'),
    border_mismatch: t('El archivo no alcanza el borde blanco contratado.', 'The file falls short of the purchased white border.'),
    unsupported_production_specs: t('Gelato requiere un área de impresión que este flujo aún no admite.', 'Gelato requires a print area this flow does not support.'),
    insufficient_resolution: t('Esta imagen no alcanza la resolución aprobada. Usa una fuente de mayor resolución.', 'This source falls below the approved resolution. Use a higher-resolution source.'),
    source_unavailable: t('La imagen ya no está disponible. Elige otra fuente.', 'The image is no longer available. Choose another source.'),
    source_reupload_required: t('Vuelve a subir el archivo de origen o elige otra fuente.', 'Upload the original source again or select another source.'),
    invalid_upload: t('Selecciona un JPG, PNG, WebP o TIFF válido.', 'Choose a valid JPG, PNG, WebP or TIFF.'),
    source_too_large: t('El archivo supera el límite permitido del proyecto o del bucket privado.', 'The file exceeds the project or private bucket limit.'),
    upload_incomplete: t('La carga no está completa. Vuelve a intentarlo.', 'The upload is incomplete. Try again.'),
    preview_changed: t('La fuente cambió. Vuelve a comparar las imágenes.', 'The source changed. Compare the images again.'),
    layout_changed: t('Se publicó otra revisión. Recarga la preparación.', 'Another revision was published. Reload the preparation.'),
    master_busy: t('Otra solicitud está generando el máster. Actualiza el estado en unos minutos.', 'Another request is generating the master. Refresh the status shortly.'),
    storage_failed: t('No se pudo guardar el archivo. Vuelve a intentar.', 'The file could not be saved. Try again.'),
    master_failed: t('No se pudo procesar el máster. Revisa la fuente y vuelve a intentar.', 'The master could not be rendered. Check the source and try again.'),
    approval_required: t('Aprueba el archivo para habilitar la descarga para producción.', 'Approve the master to enable the production download.'),
  }[code] || t('No se pudo completar la operación.', 'The operation could not be completed.')
}

export default function PrintProductionPanel({ item, variant, onChange, artworkEdit }) {
  const { t } = useI18n()
  const query = '?' + (item ? 'item=' + item : 'variant=' + variant)
  const [data, setData] = useState(null)
  const [source, setSource] = useState('')
  const [imageId, setImageId] = useState('')
  const [file, setFile] = useState(null)
  const [comparison, setComparison] = useState(null)
  const [review, setReview] = useState(null)
  const [confirmed, setConfirmed] = useState(false)
  const [busy, setBusy] = useState(false)
  const [uploadProgress, setUploadProgress] = useState(null)
  const [error, setError] = useState('')
  const [masterFile, setMasterFile] = useState(null)
  const [externalReview, setExternalReview] = useState(null)
  const [restored, setRestored] = useState(false)

  useEffect(() => {
    const controller = new AbortController()
    requestProduction(query, undefined, controller.signal).then(value => {
      setData(value)
      setSource(value.savedSource ? 'saved' : 'primary')
    }).catch(err => { if (!controller.signal.aborted) setError(err.message) })
    return () => controller.abort()
  }, [query])

  const { production, preparation, artwork } = data || {}
  const images = source === 'gallery' ? data?.gallery : data?.provenance
  const id = item || variant
  const layout = preparation?.snapshot.layout || production?.layout
  const uploadLimitMb = (data?.uploadPolicy?.maxBytes ?? MAX_PRINT_SOURCE_BYTES) / 1024 / 1024

  function resetComparison() {
    setComparison(null)
    setConfirmed(false)
  }

  async function run(action) {
    if (busy) return
    setBusy(true)
    setError('')
    setRestored(false)
    try {
      if (action === 'download' || action === 'review') {
        const { url } = await requestProduction(query + '&' + action)
        if (action === 'review') setReview(url)
        else {
          const link = document.createElement('a')
          link.href = url
          link.rel = 'noreferrer'
          link.click()
        }
        return
      }
      if (action === 'refresh') {
        setData(await requestProduction(query))
        return
      }
      let uploadId = action === 'approve_order_master' ? externalReview?.uploadId : undefined
      if (action === 'compare' || action === 'regenerate_preview') resetComparison()
      if (['attach_master', 'inspect_order_master'].includes(action) || (source === 'upload' && !['approve','approve_order_master'].includes(action))) {
        uploadId = await uploadPrintSource({ file:['attach_master', 'inspect_order_master'].includes(action) ? masterFile : file, policy: data?.uploadPolicy, storage: supabase.storage,
          projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, onProgress: setUploadProgress,
          request: async body => {
            const response = await fetch('/api/admin/artworks/' + artwork.id + '/print-assets', {
              method: 'POST', headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
              body: JSON.stringify(body),
            })
            const token = await response.json()
            if (!response.ok) throw new Error(token.error)
            return token
          } })
      }
      const result = await requestProduction('', {
        item, variant, action, revisionId: production?.revisionId, source, imageId, uploadId,
        key: action === 'approve_order_master' ? externalReview?.key : comparison?.key, confirm: confirmed,
      })
      if (action === 'inspect_order_master') setExternalReview({ ...result, uploadId })
      else if (action === 'compare' && result.key) setComparison(result)
      else {
        resetComparison()
        if (result.attached) { setMasterFile(null); setExternalReview(null) }
        if (result.regenerated) setRestored(true)
        setData(await requestProduction(query))
        onChange?.()
      }
    } catch (err) {
      setError(err.message)
      if (action === 'generate') {
        resetComparison()
        try { setData(await requestProduction(query)) } catch { /* show original error */ }
      }
    } finally {
      setUploadProgress(null)
      setBusy(false)
    }
  }

  if (!data && !error) return <InlineLoading />
  return <Tile className="grid gap-3">
    {error && <InlineNotification lowContrast kind="error" title={errorText(error, t)} onClose={() => setError('')} />}
    {restored && <InlineNotification lowContrast kind="success" title={t('Vista previa restaurada', 'Preview restored')} onClose={() => setRestored(false)} />}
    {preparation && <h3>{preparation.snapshot.title} · {t('Pedido', 'Order')} {preparation.order_id.slice(0, 8)}</h3>}
    {preparation && <Tag type={preparation.state === 'READY' ? 'green' : 'purple'}>{printProductionLabel(preparation.state, t)}</Tag>}
    {production && <Tag type={production.hasMaster ? 'green' : 'cool-gray'}>{printProductionLabel(production.status, t)}</Tag>}
    {production?.error && <p>{errorText(production.error, t)}</p>}
    <PrintLayoutSpecs layout={layout} t={t} />
    {preparation?.snapshot.framing && <p>{t('Enmarcado', 'Framing')} · {preparation.snapshot.framing}</p>}
    {data && <div className="flex flex-wrap gap-4">
      {(preparation?.snapshot.preview || production?.preview) && <figure>
        <img className="max-h-64 max-w-full" src={preparation?.snapshot.preview || production.preview} alt="" />
        <figcaption>{t('Vista previa aprobada', 'Approved preview')}</figcaption>
      </figure>}
      {comparison?.image && <figure>
        <img className="max-h-64 max-w-full" src={comparison.image} alt="" />
        <figcaption>{t('Fuente propuesta', 'Proposed source')} · {comparison.width} × {comparison.height} px · {comparison.effectiveDpi.toFixed(1)} DPI</figcaption>
      </figure>}
      {review && <figure>
        <img className="max-h-64 max-w-full" src={review} alt="" />
        <figcaption>{t('Máster privado', 'Private master')}</figcaption>
      </figure>}
    </div>}
    {preparation?.state === 'MANUAL_REVIEW' && !data?.fulfillment && <p>{t('Conserva el pago y revisa este pedido manualmente antes de producirlo.', 'Keep the payment and resolve this order manually before production.')}</p>}
    {production?.canGenerate && (!production.hasMaster || !item) && <>
      <Select id={'production-source-' + id} labelText={t('Fuente para producción', 'Production source')} value={source} disabled={busy}
        onChange={event => { setSource(event.target.value); setImageId(''); resetComparison() }}>
        {data.savedSource && <SelectItem value="saved" text={t('Fuente de la vista previa', 'Approved preview source')} />}
        <SelectItem value="primary" text={t('Fotografía principal', 'Primary photo')} />
        <SelectItem value="gallery" text={t('Galería', 'Gallery')} />
        <SelectItem value="provenance" text={t('Procedencia pública', 'Public provenance')} />
        <SelectItem value="upload" text={t('Subir archivo de mayor resolución', 'Upload higher-resolution source')} />
      </Select>
      {images && <Select id={'production-image-' + id} labelText={t('Imagen', 'Image')} value={imageId} disabled={busy}
        onChange={event => { setImageId(event.target.value); resetComparison() }}>
        <SelectItem value="" text={t('Seleccionar', 'Select')} />
        {images.map((image, i) => <SelectItem key={image.id} value={image.id} text={t('Imagen', 'Image') + ' ' + (i + 1)} />)}
      </Select>}
      {source === 'upload' && <>
        <FileUploaderDropContainer name={'production-upload-' + id} accept={PRINT_SOURCE_TYPES} multiple={false} disabled={busy}
          labelText={t(`Selecciona una imagen de hasta ${uploadLimitMb} MB`, `Choose an image up to ${uploadLimitMb} MB`)}
          onAddFiles={(_event, { addedFiles }) => { setFile(addedFiles?.[0] || null); resetComparison() }} />
        {file && <p>{file.name}</p>}
      </>}
      {!item && <Button size="sm" kind="ghost" disabled={busy || (images && !imageId) || (source === 'upload' && !file)}
        onClick={() => void run('regenerate_preview')}>{t('Restaurar vista previa con la fuente original', 'Restore preview from original source')}</Button>}
      {!production.hasMaster && <Button size="sm" kind="secondary" disabled={busy || (images && !imageId) || (source === 'upload' && !file)}
        onClick={() => void run('compare')}>{t('Validar y comparar fuente', 'Validate and compare source')}</Button>}
      {comparison?.errors.length > 0 && <>
        {comparison.errors.map(code => <InlineNotification key={code} hideCloseButton lowContrast kind="warning" title={errorText(code, t)} />)}
        <p>{item ? t('Usa una fuente compatible o resuelve el pedido manualmente con el cliente.', 'Use a compatible source or resolve the order manually with the customer.') :
          t('Para cambiar la composición, aprueba una nueva vista previa desde la obra.', 'To change the composition, approve a new preview from the artwork.')}</p>
      </>}
      {comparison && comparison.errors.length === 0 && <>
        <Checkbox id={'confirm-production-' + id} checked={confirmed} disabled={busy}
          labelText={t('Confirmo que la fuente coincide con la vista previa aprobada.', 'I confirm the source matches the approved preview.')}
          onChange={(_event, { checked }) => setConfirmed(checked)} />
        <Button size="sm" disabled={busy || !confirmed} onClick={() => void run('generate')}>{t('Generar máster con las medidas guardadas', 'Generate master with saved measurements')}</Button>
      </>}
    </>}
    {data?.fulfillment && <GelatoOrderFulfillment job={data.fulfillment} preparation={preparation}
      refresh={async () => setData(await requestProduction(query))} />}
    {data?.fulfillment && !production?.hasMaster && !data.hasOrderMaster && <div className="grid gap-2">
      <FileUploaderDropContainer name={'final-master-' + id} accept={['image/jpeg', 'image/png']} multiple={false} disabled={busy}
        labelText={t('Selecciona el máster final en JPG o PNG', 'Select the final JPG or PNG master')}
        onAddFiles={(_, { addedFiles }) => { setMasterFile(addedFiles?.[0] || null); setExternalReview(null); setConfirmed(false) }} />
      {masterFile && <p>{masterFile.name}</p>}
      <Button kind="secondary" size="sm" disabled={busy || !masterFile} onClick={() => void run(production ? 'attach_master' : 'inspect_order_master')}>
        {t('Cargar y validar máster', 'Upload and validate master')}
      </Button>
      {externalReview && <>
        <img src={externalReview.image} alt={t('Máster propuesto', 'Proposed master')} className="max-h-64 max-w-full object-contain" />
        <p>{externalReview.width} × {externalReview.height} px · {Math.round(externalReview.dpi)} DPI</p>
        <Checkbox id={'confirm-final-master-' + id} checked={confirmed} disabled={busy}
          labelText={t('Confirmo la obra, el recorte y el borde del archivo final.', 'I confirm the artwork, crop and border of the final file.')}
          onChange={(_, { checked }) => setConfirmed(checked)} />
        <Button size="sm" disabled={busy || !confirmed} onClick={() => void run('approve_order_master')}>
          {t('Aprobar para producción', 'Approve for production')}
        </Button>
      </>}
    </div>}
    <div className="flex flex-wrap gap-2">
      {(production?.hasMaster || data?.hasOrderMaster) && <>
        <Button kind="secondary" size="sm" disabled={busy} onClick={() => void run('review')}>{t('Comparar con el máster', 'Compare with master')}</Button>
        {(!item || preparation?.state === 'READY') && <Button kind="ghost" size="sm" disabled={busy}
          onClick={() => void run('download')}>{t('Descargar máster', 'Download master')}</Button>}
        {preparation?.state === 'AWAITING_APPROVAL' && <Button size="sm" disabled={busy || !review}
          onClick={() => void run('approve')}>{t('Aprobar para producción', 'Approve for production')}</Button>}
      </>}
      {artworkEdit && <Button as={Link} kind="ghost" size="sm" href={artworkEdit}>{t('Regenerar vista previa en la obra', 'Regenerate preview on artwork')}</Button>}
      {production?.status === 'MASTER_GENERATING' && <Button kind="ghost" size="sm" disabled={busy}
        onClick={() => void run('refresh')}>{t('Actualizar estado', 'Refresh status')}</Button>}
    </div>
    {busy && <InlineLoading description={t('Procesando…', 'Working…')} />}
    {uploadProgress !== null && <div role="status" aria-live="polite">
      <progress aria-label={t('Carga del archivo maestro', 'Master file upload')} value={uploadProgress} max="100" /> {uploadProgress}%
    </div>}
  </Tile>
}

