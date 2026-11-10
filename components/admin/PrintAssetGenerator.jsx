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
import { MAX_PRINT_SOURCE_BYTES, PRINT_ASSET_SIZES, PRINT_MASTER_BUCKET, PRINT_SOURCE_TYPES } from '@/lib/printAssetPresets'

import { PRINT_OUTPUT_DPI } from '@/lib/printAssetLayout'

const formats = Object.keys(PRINT_ASSET_SIZES)
const empty = { source: 'primary', imageId: '', mode: 'quality', borderMm: null, balancedDpi: null, outputDpi: null, edition: 'OPEN', editionLimit: '', title: '', description: '', price: '', replace: false, targets: {} }

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
  const [sizes, setSizes] = useState([])
  const [options, setOptions] = useState(empty)
  const [file, setFile] = useState(null)
  const [busy, setBusy] = useState('')
  const [notice, setNotice] = useState(null)
  const [results, setResults] = useState([])
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

  const matching = Object.fromEntries(sizes.map(size => [size, (data?.variants || []).filter(row => row.format === size && row.edition_type === options.edition)]))
  const hasReplacement = Object.values(matching).some(rows => rows.length > 0)
  const hasNew = Object.values(matching).some(rows => rows.length === 0)
  const targets = Object.fromEntries(sizes.map(size => [size, options.targets[size] || (matching[size].length === 1 ? matching[size][0].id : null)]))
  const missingChoice = sizes.some(size => matching[size].length > 0 && !matching[size].some(row => row.id === targets[size]))
  const sourceImages = options.source === 'gallery' ? data?.gallery : data?.provenance
  const selectedSource = options.source === 'primary' ? data?.primary : sourceImages?.find(row => row.id === options.imageId)?.image_url

  const policy = data?.policy
  const needsQualityConsent = preview?.previews.some(layout => layout.mode === 'coverage' && layout.belowQuality)
  const needsInterpolation = preview?.previews.some(layout => layout.interpolates)
  const sourceReady = options.source === 'upload' ? Boolean(file) : Boolean(selectedSource)
  const measurement = (value, digits = 1) => new Intl.NumberFormat(locale, { maximumFractionDigits: digits }).format(value)

  function errorText(code) {
    return {
      unauthorized: t('Vuelve a iniciar sesión.', 'Sign in again.'),
      forbidden: t('Se requiere el rol de administrador.', 'The administrator role is required.'),
      source_missing: t('Selecciona una imagen de origen.', 'Choose a source image.'),
      source_unavailable: t('No se pudo leer la imagen de origen.', 'The source image could not be read.'),
      source_too_large: t('La imagen de origen supera 25 MB.', 'The source image exceeds 25 MB.'),
      unsupported_source: t('Usa un JPG, PNG, WebP o TIFF válido de una sola imagen.', 'Use a valid single-image JPG, PNG, WebP or TIFF.'),
      invalid_upload: t('Selecciona un archivo compatible de hasta 25 MB.', 'Choose a supported file up to 25 MB.'),
      invalid_layout: t('Revisa el borde mínimo y la resolución seleccionada.', 'Check the minimum border and selected resolution.'),
      preview_changed: t('La imagen o la configuración cambió. Genera una nueva vista previa.', 'The image or settings changed. Create a new preview.'),
      quality_confirmation_required: t('Confirma el uso de la resolución efectiva mostrada.', 'Confirm use of the displayed effective resolution.'),
      interpolation_confirmation_required: t('Elige una resolución de salida menor o autoriza la interpolación.', 'Choose a lower output resolution or allow interpolation.'),
      invalid_options: t('Revisa el precio, el tiraje y los datos de la variante.', 'Check the price, edition size and variant details.'),
      unsupported_source_location: t('Sube una copia de esta imagen para usarla como origen.', 'Upload a copy of this image to use it as the source.'),
      generation_conflict: t('La opción cambió o ya existe. Revisa la lista y confirma el reemplazo.', 'The option changed or already exists. Review the list and confirm replacement.'),
      storage_failed: t('No se pudo guardar o descargar el archivo en el almacenamiento.', 'The file could not be saved to or downloaded from storage.'),
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
        if (!PRINT_SOURCE_TYPES.includes(file.type) || file.size > MAX_PRINT_SOURCE_BYTES) throw new Error('invalid_upload')
        setBusy('upload')
        const uploadId = crypto.randomUUID()
        const { path, token } = await requestAssets(artworkId, { body: { action: 'upload', requestId: uploadId, type: file.type, bytes: file.size } })
        const { error } = await supabase.storage.from(PRINT_MASTER_BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type })
        if (error) throw new Error('storage_failed')
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
      setBusy('')
      submitting.current = false
    }
  }

  async function generate(event) {
    event.preventDefault()
    if (submitting.current || !sizes.length || !preview || missingChoice || (hasReplacement && !options.replace) ||
      (needsQualityConsent && !acceptLowDpi) || (needsInterpolation && !allowInterpolation)) return
    submitting.current = true
    setNotice(null)
    setResults([])
    setBusy('generate')
    try {
      const response = await requestAssets(artworkId, { body: {
        ...options, requestId: crypto.randomUUID(), sizes, targets, uploadId: staged.current?.uploadId,
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

  return <div className="mt-4 grid gap-4">
    <div className="flex flex-wrap gap-2">
      {formats.map(size => <Button key={size} kind="secondary" size="sm" disabled={!data || Boolean(busy)} onClick={() => choose([size])}>
        {t('Generar', 'Generate')} {size}
      </Button>)}
      <Button kind="secondary" size="sm" disabled={!data || Boolean(busy)} onClick={() => choose(formats)}>{t('Generar A2 y A1', 'Generate A2 and A1')}</Button>
    </div>
    {notice && <InlineNotification kind="error" lowContrast title={t('Revisa la operación', 'Check the operation')}
      subtitle={errorText(notice.code)} onClose={() => setNotice(null)} />}
    {results.map(row => <InlineNotification key={row.size} kind={row.ok ? 'success' : 'error'} lowContrast
      title={row.ok ? row.size + ' · ' + t('Archivos guardados', 'Assets saved') : row.size + ' · ' + errorText(row.error)} />)}
    {busy && <InlineLoading description={busy === 'upload' ? t('Subiendo imagen de origen…', 'Uploading source image…') :
      busy === 'preview' ? t('Calculando vista previa…', 'Calculating preview…') :
      busy === 'download' ? t('Preparando descarga…', 'Preparing download…') : t('Generando archivo y vista previa…', 'Generating master and preview…')} />}

    {sizes.length > 0 && <Tile>
      <form onSubmit={generate}>
        <fieldset disabled={Boolean(busy)} className="grid gap-4">
          <h3>{t('Preparar para Prodigi', 'Prepare for Prodigi')} · {sizes.join(' / ')}</h3>
          <p>{sizes.map(size => size + ' · ' + PRINT_ASSET_SIZES[size].mm.join(' × ') + ' mm').join(' / ')}</p>
          <p>{t('Papel Enhanced Matte Art de 200 g/m². Las opciones nuevas se guardan como borrador.', 'Enhanced Matte Art 200 gsm paper. New options are saved as drafts.')}</p>
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
              labelText={t('Selecciona JPG, PNG, WebP o TIFF de hasta 25 MB', 'Choose a JPG, PNG, WebP or TIFF up to 25 MB')}
              onAddFiles={(_event, { addedFiles }) => { resetPreview(); staged.current = null; setFile(addedFiles?.[0] || null) }} />
            {file && <p>{file.name}</p>}
          </>}
          <Select id="print-asset-mode" labelText={t('Modo de ajuste', 'Layout mode')} value={options.mode} onChange={event => changeLayout('mode', event.target.value)}>
            <SelectItem value="quality" text={t('Máxima calidad', 'Maximum quality') + ' · ' + policy.qualityDpi + ' DPI'} />
            <SelectItem value="balanced" text={t('Equilibrado', 'Balanced')} />
            <SelectItem value="coverage" text={t('Máxima cobertura del papel', 'Maximum paper coverage')} />
          </Select>
          {options.mode === 'balanced' && <TextInput id="print-balanced-dpi" type="number" min={policy.balancedMinDpi} max={policy.qualityDpi}
            labelText={t('Objetivo de ppp efectivos', 'Effective DPI target')} value={options.balancedDpi ?? policy.balancedDpi}
            onChange={event => changeLayout('balancedDpi', event.target.value)} />}
          <TextInput id="print-asset-border" type="number" min={policy.minimumBorderMm} max="200" step="0.1"
            labelText={t('Borde blanco mínimo en mm', 'Minimum white border in mm')} value={options.borderMm ?? policy.minimumBorderMm}
            onChange={event => changeLayout('borderMm', event.target.value)} />
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
              labelText={t('Confirmo reemplazar el archivo y la imagen de la opción existente. Se conservan su precio, estado y datos comerciales.',
                'Replace the master and image of the existing option. Its price, status and commercial data are kept.')}
              onChange={(_event, { checked }) => change('replace', checked)} />
          </>}
          <div className="flex flex-wrap gap-2">
            <Button type="submit" disabled={Boolean(busy) || missingChoice || (hasReplacement && !options.replace) ||
              !preview || (needsQualityConsent && !acceptLowDpi) || (needsInterpolation && !allowInterpolation)}>{t('Generar archivos', 'Generate assets')}</Button>
            <Button type="button" kind="ghost" onClick={() => choose([])}>{t('Cancelar', 'Cancel')}</Button>
          </div>
        </fieldset>
      </form>
    </Tile>}
    {data?.variants.filter(row => row.generated).map(row => <Tile key={row.id} className="grid gap-2">
      <h3>{row.title || row.size} · {row.format}</h3>
      <p>{row.is_active ? t('Activa', 'Active') : t('Borrador', 'Draft')} · {measurement(row.generated.effectiveDpi)} {t('ppp efectivos', 'effective DPI')}</p>
      <div className="h-40 w-40">
        <ArtworkImage key={row.generated.preview} primaryUrl={row.generated.preview} title={t('Vista previa del papel', 'Paper preview')} className="h-full w-full object-contain" />
      </div>
      <div className="flex flex-wrap gap-2">
        <Button as="a" href={row.generated.preview} target="_blank" rel="noreferrer" kind="ghost" size="sm">{t('Ver o guardar vista previa', 'View or save preview')}</Button>
        <Button size="sm" kind="secondary" renderIcon={Download} disabled={Boolean(busy)} onClick={() => void download(row.id)}>{t('Descargar archivo maestro', 'Download master')}</Button>
        <Button as={Link} href={'/admin/prints?artwork=' + artworkId + '&variant=' + row.id} kind="ghost" size="sm">{t('Abrir opción de print', 'Open print option')}</Button>
      </div>
    </Tile>)}
  </div>
}
