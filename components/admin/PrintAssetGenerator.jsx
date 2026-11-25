'use client'

import Link from 'next/link'
import { useEffect, useRef, useState } from 'react'
import {
  Button, Checkbox, FileUploaderDropContainer, InlineLoading, InlineNotification,
  Select, SelectItem, TextArea, TextInput, Tile,
} from '@carbon/react'
import ArtworkImage from '@/components/ArtworkImage'
import { Download } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { supabase } from '@/lib/supabaseClient'
import { MAX_PRINT_SOURCE_BYTES, PRINT_ASSET_SIZES, PRINT_SOURCE_TYPES } from '@/lib/printAssetPresets'
import { uploadPrintSource } from '@/lib/printSourceUpload'

import PrintProductionPanel, { printProductionLabel } from './PrintProductionPanel'
import { PRINT_OUTPUT_DPI } from '@/lib/printAssetLayout'
import {printBorderMm} from '@/lib/printPresentation'
import ArtworkPrintMasterUpload from './ArtworkPrintMasterUpload'

const formats = Object.keys(PRINT_ASSET_SIZES)
const empty = { master: false, paperType: '', source: 'primary', imageId: '', mode: 'preset', border_unit:'percent',border_value:5,borderMm: null, balancedDpi: null, outputDpi: null, edition: 'OPEN', editionLimit: '', title: '', description: '', price: '', replace: false, targets: {} }

async function requestAssets(artworkId, { query = '', body, signal } = {}) {
  const response = await fetch('/api/admin/artworks/' + artworkId + '/print-assets' + query, {
    method: body ? 'POST' : 'GET', signal, cache: 'no-store',
    headers: { ...await authHeaders(), ...(body ? { 'Content-Type': 'application/json' } : {}) },
    body: body ? JSON.stringify(body) : undefined,
  })
  const data = await response.json().catch(() => null)
  if (!response.ok || !data) {
    throw Object.assign(new Error(data?.error || 'generation_unavailable'), { details: data?.details })
  }
  return data
}

export default function PrintAssetGenerator({ artworkId }) {
  const { t, locale } = useI18n()
  const [data, setData] = useState(null)
  const [preparation,setPreparation]=useState('generate')
  const [preparedPrint,setPreparedPrint]=useState('')
  const [sizes, setSizes] = useState([])
  const [requested,setRequested] = useState([])
  const [options, setOptions] = useState(empty)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [uploadProgress, setUploadProgress] = useState(null)
  const [notice, setNotice] = useState(null)
  const [results, setResults] = useState([])
  const [production, setProduction] = useState(null)
  const [preview, setPreview] = useState(null)
  const [acceptLowDpi, setAcceptLowDpi] = useState(false)
  const [allowInterpolation, setAllowInterpolation] = useState(false)
  const staged = useRef(null)
  const submitting = useRef(false)

  useEffect(() => {
    const controller = new AbortController()
    requestAssets(artworkId, { signal: controller.signal }).then(setData).catch(error => {
      if (!controller.signal.aborted) setNotice({ code: error.message })
    })
    return () => controller.abort()
  }, [artworkId])

  const matching = Object.fromEntries(sizes.map(size => [size, (data?.variants || []).filter(row => row.format === size && row.edition_type === options.edition && (!preview || !row.orientation || row.orientation===(preview.previews.find(row=>row.size===size)?.width===preview.previews.find(row=>row.size===size)?.height ? 'square' : preview.previews.find(row=>row.size===size)?.width>preview.previews.find(row=>row.size===size)?.height ? 'landscape' : 'portrait')) && (options.mode!=='preset' || Math.abs(printBorderMm(row,size)-printBorderMm(options,size))<0.01))]))
  const existingMaster = size => data?.variants.find(row=>row.format===size && row.edition_type==='OPEN' && (options.mode!=='preset' || Math.abs(printBorderMm(row,size)-printBorderMm(options,size))<0.01) && row.generated?.status==='MASTER_READY')
  const pendingSizes=requested
  const hasReplacement = Object.values(matching).some(rows => rows.length > 0)
  const hasNew = Object.values(matching).some(rows => rows.length === 0)
  const targets = Object.fromEntries(sizes.map(size => [size, options.targets[size] || (matching[size].length === 1 ? matching[size][0].id : null)]))
  const missingChoice = sizes.some(size => matching[size].length > 0 && !matching[size].some(row => row.id === targets[size]))
  const sourceImages = options.source === 'gallery' ? data?.gallery : data?.provenance
  const selectedSource = options.source === 'primary' ? data?.primary : sourceImages?.find(row => row.id === options.imageId)?.image_url

  const policy = data?.policy
  const uploadLimitMb = (data?.uploadPolicy?.maxBytes ?? MAX_PRINT_SOURCE_BYTES) / 1024 / 1024
  const needsQualityConsent = preview?.previews.some(layout => layout.mode === 'coverage' && layout.belowQuality)
  const belowMinimum = options.mode!=='preset' && options.master && preview?.previews.some(layout=>layout.effectiveDpi<policy.balancedMinDpi)
  const needsInterpolation = options.mode!=='preset' && preview?.previews.some(layout => layout.interpolates)
  const sourceReady = options.source === 'upload' ? Boolean(file) : Boolean(selectedSource)
  const measurement = (value, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)

  function errorText(code) {
    return {
      unauthorized: t('Vuelve a iniciar sesión.', 'Sign in again.'),
      forbidden: t('Se requiere el rol de administrador.', 'The administrator role is required.'),
      source_missing: t('Selecciona una imagen de origen.', 'Choose a source image.'),
      source_unavailable: t('No se pudo leer la imagen de origen.', 'The source image could not be read.'),
      source_too_large: t(`El archivo supera el límite permitido (hasta ${uploadLimitMb} MB). Revisa también el límite del proyecto.`, `The file exceeds the allowed limit (up to ${uploadLimitMb} MB). Also check the project limit.`),
      unsupported_source: t('Usa un JPG, PNG, WebP o TIFF válido de una sola imagen.', 'Use a valid single-image JPG, PNG, WebP or TIFF.'),
      invalid_upload: t('Selecciona un JPG, PNG, WebP o TIFF válido.', 'Choose a valid JPG, PNG, WebP or TIFF.'),
      upload_incomplete: t('La carga no está completa. Vuelve a intentarlo.', 'The upload is incomplete. Try again.'),
      output_canvas_too_large: t('Este papel excede el límite de píxeles a la resolución seleccionada. Usa 240 o 150 DPI.','This paper exceeds the pixel limit at the selected resolution. Use 240 or 150 DPI.'),
      insufficient_source_dpi: t('La imagen no alcanza la resolución mínima. Usa una fuente de mayor resolución o ajusta el encuadre.','The image does not meet the minimum resolution. Use a higher-resolution source or adjust the layout.'),
      invalid_layout: t('Revisa el borde mínimo y la resolución seleccionada.', 'Check the minimum border and selected resolution.'),
      preview_changed: t('La imagen o la configuración cambió. Genera una nueva vista previa.', 'The image or settings changed. Create a new preview.'),
      quality_confirmation_required: t('Confirma el uso de la resolución efectiva mostrada.', 'Confirm use of the displayed effective resolution.'),
      interpolation_confirmation_required: t('Elige una resolución de salida menor o autoriza la interpolación.', 'Choose a lower output resolution or allow interpolation.'),
      invalid_options: t('Revisa el precio, el tiraje y los datos de la variante.', 'Check the price, edition size and variant details.'),
      unsupported_source_location: t('Sube una copia de esta imagen para usarla como origen.', 'Upload a copy of this image to use it as the source.'),
      generation_conflict: t('La opción cambió o ya existe. Revisa la lista y confirma el reemplazo.', 'The option changed or already exists. Review the list and confirm replacement.'),
      storage_failed: t('No se pudo guardar o descargar el archivo en el almacenamiento.', 'The file could not be saved to or downloaded from storage.'),
      storage_upload_unauthorized: t('Supabase rechazó la autorización de la carga. Vuelve a intentar para solicitar un permiso nuevo.', 'Supabase rejected the upload authorization. Try again to request a new permission.'),
      generation_save_failed: t('No se pudo guardar la opción de impresión. Revisa la lista antes de volver a generar.', 'The print option could not be saved. Check the list before generating again.'),
      refresh_failed: t('Recarga la ficha para actualizar la lista de opciones.', 'Reload the artwork to refresh the option list.'),
    }[code] || t('No se pudo completar la operación.', 'The operation could not be completed.')
  }

  function choose(next) {
    resetPreview()
    staged.current = null
    setOptions(empty)
    setFile(null)
    setNotice(null)
    setResults([])
    setSizes(next)
  }

  const change = (name, value) => setOptions(previous => ({ ...previous, [name]: value }))

  function resetPreview() {
    setPreview(null)
    setAcceptLowDpi(false)
    setAllowInterpolation(false)
  }

  function changeLayout(name, value) {
    resetPreview()
    change(name, value)
  }

  async function preparePreview() {
    if (submitting.current || !sourceReady) return
    submitting.current = true
    setNotice(null)
    resetPreview()
    setBusy('preview')
    try {
      if (options.source === 'upload' && staged.current?.file !== file) {
        setBusy('upload')
        const uploadId = await uploadPrintSource({ file, policy: data?.uploadPolicy,
          request: body => requestAssets(artworkId, { body }), storage: supabase.storage,
          projectUrl: process.env.NEXT_PUBLIC_SUPABASE_URL, onProgress: setUploadProgress })
        staged.current = { file, uploadId }
      }
      setBusy('preview')
      setPreview(await requestAssets(artworkId, { body: {
        ...options, action: 'preview', requestId: crypto.randomUUID(), sizes, uploadId: staged.current?.uploadId,
      } }))
    } catch (error) {
      if (error.message === 'source_unavailable') staged.current = null
      setNotice({ code: error.message })
    } finally {
      setUploadProgress(null)
      setBusy('')
      submitting.current = false
    }
  }

  async function generate(event) {
    event.preventDefault()
    if (submitting.current || !sizes.length || !preview || belowMinimum || missingChoice || (hasReplacement && !options.replace) ||
      (needsQualityConsent && !acceptLowDpi) || (needsInterpolation && !allowInterpolation)) return
    submitting.current = true
    setNotice(null)
    setResults([])
    setBusy('generate')
    try {
      const response = await requestAssets(artworkId, { body: {
        ...options, requestId: crypto.randomUUID(), sizes, targets, uploadId: staged.current?.uploadId,
        expectedRevisions: Object.fromEntries(sizes.map(size => [
          size, matching[size].find(row => row.id === targets[size])?.generated?.revisionId ?? null,
        ])),
        previewKey: preview.previewKey, acceptLowDpi, allowInterpolation,
      } })
      staged.current = null
      resetPreview()
      setResults(response.results)
      setSizes(response.results.filter(row => !row.ok).map(row => row.size))
      setOptions(previous => ({ ...previous, replace: false }))
      try { setData(await requestAssets(artworkId)) }
      catch { setNotice({ code: 'refresh_failed' }) }
    } catch (error) {
      setNotice({ code: error.message })
      if (['source_unavailable', 'generation_unavailable'].includes(error.message)) staged.current = null
      if (['preview_changed', 'source_unavailable', 'generation_unavailable'].includes(error.message)) resetPreview()
      if (error.message === 'generation_conflict') {
        try { setData(await requestAssets(artworkId)); setOptions(previous => ({ ...previous, replace: false, targets: {} })) }
        catch { /* keep the existing form visible */ }
      }
    } finally {
      setBusy('')
      submitting.current = false
    }
  }

  async function download(printId) {
    setBusy('download')
    setNotice(null)
    try {
      const { url } = await requestAssets(artworkId, { query: '?master=' + encodeURIComponent(printId) })
      const link = document.createElement('a')
      link.href = url
      link.rel = 'noreferrer'
      link.click()
    } catch (error) {
      setNotice({ code: error.message })
    } finally {
      setBusy('')
    }
  }

  return <div id="print-assets" className="mt-4 grid gap-4">
    <Select id="print-preparation" labelText={t('Preparar archivos','Prepare files')} value={preparation} onChange={event=>setPreparation(event.target.value)}>
      <SelectItem value="generate" text={t('Generar desde una imagen','Generate from an image')} />
      <SelectItem value="prepared" text={t('Subir preview y maestro ya preparados','Upload prepared preview and master')} />
    </Select>
    {preparation==='prepared' && <Tile>
      <p>{t('El borde ya debe estar incluido. Puedes guardar primero el preview y asociar el maestro despues al mismo registro.','The border must already be included. Save the preview first and attach the master later to the same record.')}</p>
      <Select id="prepared-print" labelText={t('Artwork Print de destino','Destination Artwork Print')} value={preparedPrint} onChange={event=>setPreparedPrint(event.target.value)}>
        <SelectItem value="" text={t('Selecciona una presentacion','Select a presentation')} />
        {(data?.preparedVariants || data?.variants || []).map(row=><SelectItem key={row.id} value={row.id} text={(row.title || row.size)+' | '+row.size+' | '+(row.border_value || 0)+(row.border_unit==='percent'?' %':' mm')} />)}
      </Select>
      <Button as={Link} kind="ghost" href={'/admin/prints?artwork='+artworkId}>{t('Crear o editar presentacion','Create or edit presentation')}</Button>
      {preparedPrint && <ArtworkPrintMasterUpload key={preparedPrint} printId={preparedPrint} onChange={async()=>setData(await requestAssets(artworkId))} />}
    </Tile>}
    <div hidden={preparation!=='generate'}>
    <div className="flex flex-wrap gap-2">
      {['A2','A1'].map(size => <Button key={size} kind="secondary" size="sm" disabled={!data || Boolean(busy)} onClick={() => choose([size])}>
        {t('Generar', 'Generate')} {size}
      </Button>)}
      <Button kind="secondary" size="sm" disabled={!data || Boolean(busy)}
        onClick={() => choose(['A2','A1'])}>{t('Preparar A2 y A1 pendientes', 'Prepare remaining A2 and A1')}</Button>
    </div>
    {data && <fieldset disabled={Boolean(busy)}>
      <legend>{t('Tamaños para máster de edición abierta','Open edition master sizes')}</legend>
      <div className="flex flex-wrap gap-3">
        {formats.map(size=>{
          const master=existingMaster(size)
          const preset=PRINT_ASSET_SIZES[size]
          return <Checkbox key={size} id={`print-master-size-${artworkId}-${size}`} checked={requested.includes(size)}
            labelText={`${preset.label || size} · ${preset.mm.join(' × ')} mm${master ? ` · ${t('Máster existente','Existing master')} · ${measurement(master.generated.effectiveDpi)} DPI` : ''}`}
            onChange={(_, {checked})=>setRequested(previous=>checked ? [...previous,size] : previous.filter(value=>value!==size))} />
        })}
      </div>
      <Button size="sm" disabled={!pendingSizes.length} onClick={()=>choose(pendingSizes)}>{t('Preparar tamaños seleccionados','Prepare selected sizes')}</Button>
    </fieldset>}
    {notice && <InlineNotification kind="error" lowContrast title={t('Revisa la operación', 'Check the operation')}
      subtitle={errorText(notice.code)} onClose={() => setNotice(null)} />}
    {results.map(row => <InlineNotification key={row.size} kind={row.ok ? 'success' : 'error'} lowContrast
      title={row.ok ? row.size + ' · ' + printProductionLabel(row.productionStatus, t) : row.size + ' · ' + errorText(row.error)} />)}
    {busy && <InlineLoading description={busy === 'upload' ? t('Subiendo imagen de origen…', 'Uploading source image…') :
      busy === 'preview' ? t('Calculando vista previa…', 'Calculating preview…') :
      busy === 'download' ? t('Preparando descarga…', 'Preparing download…') : t('Guardando revisión…', 'Saving revision…')} />}
    {uploadProgress !== null && <div role="status" aria-live="polite">
      <progress aria-label={t('Carga del archivo maestro', 'Master file upload')} value={uploadProgress} max="100" /> {uploadProgress}%
    </div>}

    {sizes.length > 0 && <Tile>
      <form onSubmit={generate}>
        <fieldset disabled={Boolean(busy)} className="grid gap-4">
          <h3>{t('Preparar para Prodigi', 'Prepare for Prodigi')} · {sizes.join(' / ')}</h3>
          <p>{sizes.map(size => size + ' · ' + PRINT_ASSET_SIZES[size].mm.join(' × ') + ' mm').join(' / ')}</p>
          <p>{t('Papel Enhanced Matte Art de 200 g/m². Las opciones nuevas se guardan como borrador.', 'Enhanced Matte Art 200 gsm paper. New options are saved as drafts.')}</p>
          <Select id="print-asset-deliverable" labelText={t('Qué guardar', 'What to save')} value={options.master ? 'both' : 'preview'}
            onChange={event => change('master', event.target.value === 'both')}>
            <SelectItem value="preview" text={t('Solo vista previa. Generar máster después', 'Preview only. Generate master later')} />
            <SelectItem value="both" text={t('Vista previa y máster privado', 'Preview and private master')} />
          </Select>
          {options.source === 'upload' && !options.master && <p>{t(
            'Conserva tu archivo original. Para producir esta revisión más adelante, podrás volver a subirlo o elegir una fuente compatible.',
            'Keep your original file. When preparing this revision later, you can upload it again or choose a compatible source.',
          )}</p>}
          <Select id="print-asset-source" labelText={t('Origen', 'Source')} value={options.source}
            onChange={event => { resetPreview(); setOptions(previous => ({ ...previous, source: event.target.value, imageId: '' })) }}>
            <SelectItem value="primary" text={t('Fotografía principal guardada', 'Saved primary photo')} />
            <SelectItem value="gallery" text={t('Imagen de la galería', 'Gallery image')} />
            <SelectItem value="provenance" text={t('Imagen pública de procedencia', 'Public provenance image')} />
            <SelectItem value="upload" text={t('Subir imagen de alta resolución', 'Upload a high-resolution image')} />
          </Select>
          {['gallery', 'provenance'].includes(options.source) && <Select id="print-asset-source-image"
            labelText={t('Seleccionar imagen', 'Choose image')} value={options.imageId} required onChange={event => changeLayout('imageId', event.target.value)}>
            <SelectItem value="" text={t('Elige una imagen', 'Choose an image')} />
            {sourceImages?.map((row, index) => <SelectItem key={row.id} value={row.id} text={t('Imagen', 'Image') + ' ' + (index + 1)} />)}
          </Select>}
          {options.source !== 'upload' && selectedSource && <div className="h-28 w-28">
            <ArtworkImage key={selectedSource} primaryUrl={selectedSource} title={t('Imagen de origen seleccionada', 'Selected source image')} className="h-full w-full object-contain" />
          </div>}
          {options.source === 'upload' && <>
            <FileUploaderDropContainer name="print-asset-upload" accept={PRINT_SOURCE_TYPES} multiple={false}
              labelText={t(`Selecciona JPG, PNG, WebP o TIFF de hasta ${uploadLimitMb} MB`, `Choose a JPG, PNG, WebP or TIFF up to ${uploadLimitMb} MB`)}
              onAddFiles={(_event, { addedFiles }) => { resetPreview(); staged.current = null; setFile(addedFiles?.[0] || null) }} />
            {file && <p>{file.name}</p>}
          </>}
          <Select id="print-asset-mode" labelText={t('Modo de ajuste', 'Layout mode')} value={options.mode} onChange={event => changeLayout('mode', event.target.value)}>
            <SelectItem value="preset" text={t('Preset: ajustar, ampliar y centrar sobre papel blanco','Preset: fit, enlarge and center on white paper')} />
              <SelectItem value="quality" text={t('Máxima calidad', 'Maximum quality') + ' · ' + policy.qualityDpi + ' DPI'} />
            <SelectItem value="balanced" text={t('Equilibrado', 'Balanced')} />
            <SelectItem value="coverage" text={t('Máxima cobertura del papel', 'Maximum paper coverage')} />
          </Select>
          {options.mode === 'balanced' && <TextInput id="print-balanced-dpi" type="number" min={policy.balancedMinDpi} max={policy.qualityDpi}
            labelText={t('Objetivo de ppp efectivos', 'Effective DPI target')} value={options.balancedDpi ?? policy.balancedDpi}
            onChange={event => changeLayout('balancedDpi', event.target.value)} />}
          {options.mode==='preset' ? <><Select id="preset-border-unit" labelText={t('Borde minimo por lado','Minimum border per side')} value={options.border_unit} onChange={event=>changeLayout('border_unit',event.target.value)}>
            <SelectItem value="none" text={t('Sin borde reservado','No reserved border')} /><SelectItem value="percent" text={t('Porcentaje del lado corto','Percent of the short edge')} /><SelectItem value="mm" text="mm" /></Select>
            {options.border_unit!=='none' && <TextInput id="preset-border-value" type="number" min="0" step="0.1" max={options.border_unit==='percent'?49:200} labelText={t('Valor por lado','Value per side')} value={options.border_value} onChange={event=>changeLayout('border_value',Number(event.target.value))} />}
            <p>{t('5% o 10% se calcula sobre el lado corto del papel, por cada lado. El ajuste conserva la proporcion y puede dejar mas blanco en los otros dos lados. Lanczos; ampliar o reducir.','5% or 10% is calculated from the paper short edge, per side. Fitting preserves the aspect ratio and may leave more white on the other two sides. Lanczos; enlarge or reduce.')}</p></> : <TextInput id="print-asset-border" type="number" min={policy.minimumBorderMm} max="200" step="0.1"
            labelText={t('Borde blanco mínimo en mm', 'Minimum white border in mm')} value={options.borderMm ?? policy.minimumBorderMm}
            onChange={event => changeLayout('borderMm', event.target.value)} />}
          <Select id="print-output-dpi" labelText={t('Resolución del archivo final', 'Output file resolution')}
            value={options.outputDpi ?? policy.outputDpi} onChange={event => changeLayout('outputDpi', event.target.value)}>
            {PRINT_OUTPUT_DPI.map(dpi => <SelectItem key={dpi} value={dpi} text={dpi + ' DPI'} />)}
          </Select>
          <div><Button type="button" kind="secondary" size="sm" disabled={!sourceReady || Boolean(busy)} onClick={() => void preparePreview()}>
            {t('Calcular vista previa', 'Calculate preview')}
          </Button></div>
          {preview && <div className="grid gap-4">
            {preview.previews.map(layout => <Tile key={layout.size} className="grid gap-2">
              <h4>{layout.size} · {layout.paperWidthMm} × {layout.paperHeightMm} mm</h4>
              {/* eslint-disable-next-line @next/next/no-img-element -- Bounded WebP returned by the authenticated preview endpoint. */}
              <img className="h-auto max-h-64 max-w-full object-contain" src={layout.image} alt={t('Vista previa de la obra y sus bordes', 'Preview of the artwork and its borders')} />
              <p>{t('Origen', 'Source')} · {layout.sourceWidth} × {layout.sourceHeight} px</p>
              <p>{t('Obra impresa', 'Printed artwork')} · {measurement(layout.artworkWidthMm / 10)} × {measurement(layout.artworkHeightMm / 10)} cm · {measurement(layout.effectiveDpi)} {t('ppp efectivos', 'effective DPI')}</p>
              <p>{t('Bordes en mm (izq. / der. / sup. / inf.)', 'Borders in mm (left / right / top / bottom)')} · {
                [layout.marginsMm.left, layout.marginsMm.right, layout.marginsMm.top, layout.marginsMm.bottom].map(value => measurement(value)).join(' / ')
              }</p>
              {layout.smallArtwork && <p>{t('La obra ocupará una porción pequeña del papel con este ajuste.', 'The artwork will occupy a small portion of the paper with this layout.')}</p>}
              {layout.belowQuality && <p>{t(
                'Esta colocación queda por debajo del objetivo de máxima calidad. Puedes aumentar los bordes, elegir otro modo o subir una imagen con más píxeles.',
                'This placement is below the maximum-quality target. You can increase the borders, choose another mode or upload an image with more pixels.',
              )}</p>}
              {layout.interpolates && <p>{t(
                'La salida seleccionada requiere interpolación. Para evitarla, baja la resolución del archivo final o aumenta el borde mínimo.',
                'The selected output requires interpolation. To avoid it, lower the output resolution or increase the minimum border.',
              )}</p>}
            </Tile>)}
            {belowMinimum && <p role="alert">{errorText('insufficient_source_dpi')}</p>}
            {needsQualityConsent && <Checkbox id="accept-print-low-dpi" checked={acceptLowDpi}
              labelText={t('Acepto los ppp efectivos indicados para máxima cobertura.', 'I accept the displayed effective DPI for maximum coverage.')}
              onChange={(_event, { checked }) => setAcceptLowDpi(checked)} />}
            {needsInterpolation && <Checkbox id="accept-print-interpolation" checked={allowInterpolation}
              labelText={t('Autorizo interpolar para el archivo final. Esto no añade detalle original.', 'Allow interpolation for the output file. This adds no original detail.')}
              onChange={(_event, { checked }) => setAllowInterpolation(checked)} />}
          </div>}
          <Select id="print-asset-edition" labelText={t('Edición', 'Edition')} value={options.edition}
            onChange={event => setOptions(previous => ({ ...previous, edition: event.target.value, targets: {}, replace: false }))}>
            <SelectItem value="OPEN" text={t('Edición abierta', 'Open Edition')} />
            <SelectItem value="LIMITED" text={t('Edición limitada', 'Limited Edition')} />
          </Select>
          <TextInput id="print-asset-paper" labelText={t('Papel para esta revisión (opcional)', 'Paper for this revision (optional)')}
            helperText={t('Si lo dejas vacío, se conserva el papel existente o se usa Enhanced Matte Art de 200 g/m².', 'If blank, retain the existing paper or use Enhanced Matte Art 200 gsm.')}
            maxLength={200} value={options.paperType} onChange={event => change('paperType', event.target.value)} />
          {hasNew && <>
            <TextInput id="print-asset-title" labelText={t('Título de la nueva opción (opcional)', 'New option title (optional)')} value={options.title}
              maxLength={200} onChange={event => change('title', event.target.value)} />
            <TextArea id="print-asset-description" labelText={t('Descripción de la nueva opción (opcional)', 'New option description (optional)')}
              value={options.description} maxLength={10000} onChange={event => change('description', event.target.value)} />
            <TextInput id="print-asset-price" labelText={t('Precio de la nueva opción en MXN (opcional)', 'New option price in MXN (optional)')}
              type="number" min="0.01" step="0.01" value={options.price} onChange={event => change('price', event.target.value)} />
            {options.edition === 'LIMITED' && <TextInput id="print-asset-edition-limit" labelText={t('Tiraje de la nueva opción', 'New option edition size')}
              type="number" min="1" step="1" required value={options.editionLimit} onChange={event => change('editionLimit', event.target.value)} />}
          </>}
          {hasReplacement && <>
            {sizes.filter(size => matching[size].length).map(size => <Select key={size} id={'replace-print-' + size}
              labelText={t('Opción existente', 'Existing option') + ' · ' + size} value={targets[size] || ''}
              onChange={event => setOptions(previous => ({ ...previous, targets: { ...previous.targets, [size]: event.target.value }, replace: false }))}>
              <SelectItem value="" text={t('Elige la opción a actualizar', 'Choose the option to update')} />
              {matching[size].map(row => <SelectItem key={row.id} value={row.id}
                text={[row.title || row.size, row.framing, Number(row.price) > 0 && new Intl.NumberFormat(locale, { style: 'currency', currency: 'MXN' }).format(row.price)].filter(Boolean).join(' · ')} />)}
            </Select>)}
            <Checkbox id="confirm-print-replacement" checked={options.replace}
              labelText={t('Apruebo una nueva revisión para futuras compras. Los pedidos existentes conservan sus especificaciones.',
                'Approve a new revision for future purchases. Existing orders keep their specifications.')}
              onChange={(_event, { checked }) => change('replace', checked)} />
          </>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={Boolean(busy) || missingChoice || (hasReplacement && !options.replace) ||
              !preview || belowMinimum || (needsQualityConsent && !acceptLowDpi) || (needsInterpolation && !allowInterpolation)}>{t('Guardar revisión', 'Save revision')}</Button>
            <Button type="button" kind="ghost" onClick={() => choose([])}>{t('Cancelar', 'Cancel')}</Button>
          </div>
        </fieldset>
      </form>
    </Tile>}
    {data?.variants.filter(row => row.generated).map(row => <Tile key={row.id} className="grid gap-2">
      <h3>{row.title || row.size} · {row.format}</h3>
      <p>{row.is_active ? t('Activa', 'Active') : t('Borrador', 'Draft')} · {printProductionLabel(row.generated.status, t)} · {measurement(row.generated.effectiveDpi)} {t('ppp efectivos', 'effective DPI')}</p>
      <div className="h-40 w-40">
        <ArtworkImage key={row.generated.preview} primaryUrl={row.generated.preview} title={t('Vista previa del papel', 'Paper preview')} className="h-full w-full object-contain" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button as="a" href={row.generated.preview} target="_blank" rel="noreferrer" kind="ghost" size="sm">{t('Ver o guardar vista previa', 'View or save preview')}</Button>
        <Button size="sm" kind="secondary" onClick={() => setProduction(production === row.id ? null : row.id)}>
          {row.generated.status === 'MASTER_READY' ? t('Inspeccionar máster', 'Inspect master') : t('Preparar máster', 'Prepare master')}
        </Button>
        {row.generated.status === 'MASTER_READY' && <Button size="sm" kind="secondary" renderIcon={Download} disabled={Boolean(busy)} onClick={() => void download(row.id)}>{t('Descargar archivo maestro', 'Download master')}</Button>}
        <Button kind="ghost" size="sm" disabled={Boolean(busy)} onClick={()=>{
          choose([row.format])
          setOptions({...empty,border_unit:row.border_unit || 'none',border_value:row.border_value || 0,edition:row.edition_type,targets:{[row.format]:row.id}})
        }}>{t('Preparar otra revisión','Prepare another revision')}</Button>
        <Button as={Link} href={'/admin/prints?artwork=' + artworkId + '&variant=' + row.id} kind="ghost" size="sm">{t('Abrir opción de print', 'Open print option')}</Button>
      </div>
      {production === row.id && <PrintProductionPanel key={row.id} variant={row.id}
        onChange={() => { requestAssets(artworkId).then(setData).catch(() => setNotice({ code: 'refresh_failed' })) }} />}
    </Tile>)}
    </div>
  </div>
}

