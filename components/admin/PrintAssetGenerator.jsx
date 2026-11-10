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
import { MAX_PRINT_SOURCE_BYTES, MIN_SOURCE_DPI, PRINT_ASSET_SIZES, PRINT_MASTER_BUCKET, PRINT_SOURCE_TYPES } from '@/lib/printAssetPresets'

const formats = Object.keys(PRINT_ASSET_SIZES)
const empty = { source: 'primary', imageId: '', borderMode: 'margin', edition: 'OPEN', editionLimit: '', title: '', description: '', price: '', replace: false, targets: {} }

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

  function errorText(code, details) {
    if (code === 'insufficient_resolution') return t(
      `${details?.size || ''} requiere al menos ${MIN_SOURCE_DPI} ppp efectivos. La imagen da ${details?.effectiveDpi ?? '—'} ppp con estos bordes.`,
      `${details?.size || ''} needs at least ${MIN_SOURCE_DPI} effective DPI. This image gives ${details?.effectiveDpi ?? '—'} DPI with these borders.`,
    )
    return {
      unauthorized: t('Vuelve a iniciar sesión.', 'Sign in again.'),
      forbidden: t('Se requiere el rol de administrador.', 'The administrator role is required.'),
      source_missing: t('Selecciona una imagen de origen.', 'Choose a source image.'),
      source_unavailable: t('No se pudo leer la imagen de origen.', 'The source image could not be read.'),
      source_too_large: t('La imagen de origen supera 25 MB.', 'The source image exceeds 25 MB.'),
      unsupported_source: t('Usa un JPG, PNG, WebP o TIFF válido de una sola imagen.', 'Use a valid single-image JPG, PNG, WebP or TIFF.'),
      invalid_upload: t('Selecciona un archivo compatible de hasta 25 MB.', 'Choose a supported file up to 25 MB.'),
      invalid_options: t('Revisa el precio, el tiraje y los datos de la variante.', 'Check the price, edition size and variant details.'),
      unsupported_source_location: t('Sube una copia de esta imagen para usarla como origen.', 'Upload a copy of this image to use it as the source.'),
      generation_conflict: t('La opción cambió o ya existe. Revisa la lista y confirma el reemplazo.', 'The option changed or already exists. Review the list and confirm replacement.'),
      storage_failed: t('No se pudo guardar o descargar el archivo en el almacenamiento.', 'The file could not be saved to or downloaded from storage.'),
      generation_save_failed: t('No se pudo guardar la opción de impresión. Revisa la lista antes de volver a generar.', 'The print option could not be saved. Check the list before generating again.'),
      refresh_failed: t('Recarga la ficha para actualizar la lista de opciones.', 'Reload the artwork to refresh the option list.'),
    }[code] || t('No se pudo completar la operación.', 'The operation could not be completed.')
  }

  function choose(next) {
    setOptions(empty)
    setFile(null)
    setNotice(null)
    setResults([])
    setSizes(next)
  }

  const change = (name, value) => setOptions(previous => ({ ...previous, [name]: value }))

  async function generate(event) {
    event.preventDefault()
    if (submitting.current || !sizes.length || missingChoice || (hasReplacement && !options.replace)) return
    submitting.current = true
    setNotice(null)
    setResults([])
    const requestId = crypto.randomUUID()
    try {
      if (options.source === 'upload') {
        if (!file || !PRINT_SOURCE_TYPES.includes(file.type) || file.size > MAX_PRINT_SOURCE_BYTES) throw new Error('invalid_upload')
        setBusy('upload')
        const { path, token } = await requestAssets(artworkId, { body: { action: 'upload', requestId, type: file.type, bytes: file.size } })
        const { error } = await supabase.storage.from(PRINT_MASTER_BUCKET).uploadToSignedUrl(path, token, file, { contentType: file.type })
        if (error) throw new Error('storage_failed')
      }
      setBusy('generate')
      const response = await requestAssets(artworkId, { body: { ...options, requestId, sizes, targets } })
      setResults(response.results)
      setSizes(response.results.filter(row => !row.ok).map(row => row.size))
      setOptions(previous => ({ ...previous, replace: false }))
      try { setData(await requestAssets(artworkId)) }
      catch { setNotice({ code: 'refresh_failed' }) }
    } catch (error) {
      setNotice({ code: error.message, details: error.details })
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
      subtitle={errorText(notice.code, notice.details)} onClose={() => setNotice(null)} />}
    {results.map(row => <InlineNotification key={row.size} kind={row.ok ? 'success' : 'error'} lowContrast
      title={row.ok ? row.size + ' · ' + t('Archivos guardados', 'Assets saved') : row.size + ' · ' + errorText(row.error)} />)}
    {busy && <InlineLoading description={busy === 'upload' ? t('Subiendo imagen de origen…', 'Uploading source image…') :
      busy === 'download' ? t('Preparando descarga…', 'Preparing download…') : t('Generando archivo y vista previa…', 'Generating master and preview…')} />}

    {sizes.length > 0 && <Tile>
      <form onSubmit={generate}>
        <fieldset disabled={Boolean(busy)} className="grid gap-4">
          <h3>{t('Preparar para Prodigi', 'Prepare for Prodigi')} · {sizes.join(' / ')}</h3>
          <p>{sizes.map(size => size + ' · ' + PRINT_ASSET_SIZES[size].mm.join(' × ') + ' mm').join(' / ')}</p>
          <p>{t('Papel Enhanced Matte Art de 200 g/m². Las opciones nuevas se guardan como borrador.', 'Enhanced Matte Art 200 gsm paper. New options are saved as drafts.')}</p>
          <Select id="print-asset-source" labelText={t('Origen', 'Source')} value={options.source}
            onChange={event => setOptions(previous => ({ ...previous, source: event.target.value, imageId: '' }))}>
            <SelectItem value="primary" text={t('Fotografía principal guardada', 'Saved primary photo')} />
            <SelectItem value="gallery" text={t('Imagen de la galería', 'Gallery image')} />
            <SelectItem value="provenance" text={t('Imagen pública de procedencia', 'Public provenance image')} />
            <SelectItem value="upload" text={t('Subir imagen de alta resolución', 'Upload a high-resolution image')} />
          </Select>
          {['gallery', 'provenance'].includes(options.source) && <Select id="print-asset-source-image"
            labelText={t('Seleccionar imagen', 'Choose image')} value={options.imageId} required onChange={event => change('imageId', event.target.value)}>
            <SelectItem value="" text={t('Elige una imagen', 'Choose an image')} />
            {sourceImages?.map((row, index) => <SelectItem key={row.id} value={row.id} text={t('Imagen', 'Image') + ' ' + (index + 1)} />)}
          </Select>}
          {options.source !== 'upload' && selectedSource && <div className="h-28 w-28">
            <ArtworkImage key={selectedSource} primaryUrl={selectedSource} title={t('Imagen de origen seleccionada', 'Selected source image')} className="h-full w-full object-contain" />
          </div>}
          {options.source === 'upload' && <>
            <FileUploaderDropContainer name="print-asset-upload" accept={PRINT_SOURCE_TYPES} multiple={false}
              labelText={t('Selecciona JPG, PNG, WebP o TIFF de hasta 25 MB', 'Choose a JPG, PNG, WebP or TIFF up to 25 MB')}
              onAddFiles={(_event, { addedFiles }) => setFile(addedFiles?.[0] || null)} />
            {file && <p>{file.name}</p>}
          </>}
          <Select id="print-asset-border" labelText={t('Borde blanco', 'White border')} value={options.borderMode} onChange={event => change('borderMode', event.target.value)}>
            <SelectItem value="margin" text={t('10 mm como mínimo', 'At least 10 mm')} />
            <SelectItem value="fit" text={t('Solo el espacio sobrante al ajustar', 'Use only space left after fitting')} />
          </Select>
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
              (options.source === 'upload' ? !file : !selectedSource)}>{t('Generar archivos', 'Generate assets')}</Button>
            <Button type="button" kind="ghost" onClick={() => choose([])}>{t('Cancelar', 'Cancel')}</Button>
          </div>
        </fieldset>
      </form>
    </Tile>}
    {data?.variants.filter(row => row.generated).map(row => <Tile key={row.id} className="grid gap-2">
      <h3>{row.title || row.size} · {row.format}</h3>
      <p>{row.is_active ? t('Activa', 'Active') : t('Borrador', 'Draft')} · {row.generated.effectiveDpi} {t('ppp efectivos', 'effective DPI')}</p>
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
