'use client'

import { useEffect, useState } from 'react'
import { Button, Checkbox, FileUploaderButton, InlineLoading, InlineNotification, Select, SelectItem, TextArea, TextInput } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'
import { supabase } from '@/lib/supabaseClient'

const draft = {
  size: 'A3', width_mm: '297', height_mm: '420', dpi: '300',
  print_notes: '', currency: 'MXN', price: '', download_limit: '3', active: false,
}

function editable(variant) {
  return {
    ...variant,
    price: (variant.amount_minor / 100).toFixed(2),
  }
}

export default function DigitalDownloadsManager({ artworkId, className }) {
  const { t } = useI18n()
  const [variants, setVariants] = useState(null)
  const [hidden, setHidden] = useState(false)
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [editor, setEditor] = useState(draft)
  const [file, setFile] = useState(null)
  const endpoint = `/api/admin/artworks/${artworkId}/digital-downloads`

  useEffect(() => {
    const controller = new AbortController()
    async function load() {
      try {
        const response = await fetch(endpoint, {
          headers: await authHeaders(), signal: controller.signal, cache: 'no-store',
        })
        if (controller.signal.aborted) return
        if (response.status === 404 || response.status === 403) return setHidden(true)
        if (!response.ok) throw new Error('operation_failed')
        const { variants: rows } = await response.json()
        if (!controller.signal.aborted) setVariants(rows)
      } catch {
        if (!controller.signal.aborted) setError('operation_failed')
      }
    }
    load()
    return () => controller.abort()
  }, [endpoint])

  const set = (field, value) => setEditor(current => ({ ...current, [field]: value }))
  const choose = (variant) => {
    setEditor(variant ? editable(variant) : draft)
    setFile(null)
    setError('')
  }
  const send = async (data) => {
    const response = await fetch(endpoint, {
      method: 'POST',
      headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
      body: JSON.stringify(data),
    })
    const result = await response.json()
    if (!response.ok) throw new Error(result.error || 'operation_failed')
    return result
  }
  const update = variant => {
    setVariants(rows => [...rows.filter(row => row.id !== variant.id), variant].sort((a, b) => a.size.localeCompare(b.size)))
    choose(variant)
  }
  const run = async (action) => {
    setError('')
    setBusy(true)
    try {
      await action()
    } catch (failure) {
      setError(failure.message)
    } finally {
      setBusy(false)
    }
  }
  const save = (event) => {
    event.preventDefault()
    run(async () => {
      const fields = {
        size: editor.size, width_mm: Number(editor.width_mm), height_mm: Number(editor.height_mm),
        dpi: Number(editor.dpi), print_notes: editor.print_notes, currency: editor.currency,
        amount_minor: Math.round(Number(editor.price) * 100),
        download_limit: Number(editor.download_limit), active: editor.active,
      }
      const result = await send(editor.id
        ? { action: 'save', id: editor.id, revision: editor.revision, ...fields }
        : { action: 'create', ...fields })
      update(result.variant)
    })
  }
  const upload = () => run(async () => {
    if (file.size > 50 * 1024 * 1024 || !['image/jpeg', 'image/png'].includes(file.type)) {
      throw new Error('invalid_master')
    }
    const target = { id: editor.id, revision: editor.revision }
    const signed = await send({ action: 'upload', ...target })
    const staged = await supabase.storage.from('digital-art-masters').uploadToSignedUrl(
      signed.path, signed.token, file, { contentType: file.type },
    )
    if (staged.error) throw new Error('upload_failed')
    const { variant } = await send({ action: 'confirm', ...target, uploadId: signed.uploadId, name: file.name })
    setVariants(rows => rows.map(row => row.id === variant.id ? variant : row))
    // Upload updates only the persisted file. Keep any unsaved print settings in the editor.
    setEditor(current => ({
      ...current, revision: variant.revision, master_name: variant.master_name,
      pixel_width: variant.pixel_width, pixel_height: variant.pixel_height,
    }))
    setFile(null)
  })

  if (hidden) return null
  const messages = {
    invalid_fields: t('Revisa las medidas, el precio y el límite de descargas.', 'Check the dimensions, price, and download limit.'),
    insufficient_resolution: t('El archivo no tiene suficientes píxeles para ese tamaño y resolución.', 'The file has too few pixels for this size and resolution.'),
    invalid_master: t('Selecciona un JPEG o PNG válido de hasta 50 MB.', 'Choose a valid JPEG or PNG up to 50 MB.'),
    master_required: t('Carga un archivo maestro antes de activar la variante.', 'Upload a master file before activating the variant.'),
    stale_variant: t('Otra operación cambió esta variante. Recarga la página y vuelve a intentarlo.', 'Another operation changed this variant. Reload the page and try again.'),
  }

  return (
    <section className={className}>
      <h2>{t('Descargas digitales', 'Digital Downloads')}</h2>
      <p>{t('Gestiona archivos privados y especificaciones de impresión para esta obra.',
        'Manage private files and print specifications for this artwork.')}</p>
      {error && <InlineNotification kind="error" title={messages[error] ||
        t('No se pudo completar la operación.', 'The operation could not be completed.')} hideCloseButton />}
      {!variants && !error && <InlineLoading description={t('Cargando variantes…', 'Loading variants…')} />}
      {variants && (
        <form onSubmit={save}>
          <fieldset disabled={busy} style={{ display: 'grid', gap: '1rem' }}>
            <Select id="digital-variant" labelText={t('Variante', 'Variant')} value={editor.id || ''}
              onChange={event => choose(variants.find(row => row.id === event.target.value))}>
              <SelectItem value="" text={t('Nueva variante', 'New variant')} />
              {variants.map(row => <SelectItem key={row.id} value={row.id}
                text={`${row.size} · ${row.currency} · ${row.active ? t('Activa', 'Active') : t('Inactiva', 'Inactive')}`} />)}
            </Select>
            <TextInput id="digital-size" labelText={t('Tamaño', 'Size')} required maxLength={60}
              value={editor.size} onChange={event => set('size', event.target.value)} />
            {[
              ['width_mm', t('Ancho (mm)', 'Width (mm)'), 1, 2000, '0.01'],
              ['height_mm', t('Alto (mm)', 'Height (mm)'), 1, 2000, '0.01'],
              ['dpi', t('Resolución mínima (PPP)', 'Minimum resolution (PPI)'), 72, 600, '1'],
              ['price', t('Precio', 'Price'), 0.01, 999999.99, '0.01'],
              ['download_limit', t('Límite de descargas por compra', 'Download limit per purchase'), 1, 20, '1'],
            ].map(([field, label, min, max, step]) => <TextInput key={field} id={`digital-${field}`}
              type="number" required labelText={label} min={min} max={max} step={step}
              value={editor[field]} onChange={event => set(field, event.target.value)} />)}
            <Select id="digital-currency" labelText={t('Moneda', 'Currency')}
              value={editor.currency} onChange={event => set('currency', event.target.value)}>
              <SelectItem value="MXN" text="MXN" />
              <SelectItem value="USD" text="USD" />
            </Select>
            <TextArea id="digital-notes" labelText={t('Especificaciones de impresión', 'Print specifications')}
              maxLength={1000} value={editor.print_notes} onChange={event => set('print_notes', event.target.value)} />
            <Checkbox id="digital-active" labelText={t('Variante activa', 'Active variant')}
              disabled={!editor.master_name} checked={editor.active}
              onChange={(_, { checked }) => set('active', checked)} />
            <div><Button type="submit" disabled={busy}>{t('Guardar variante', 'Save variant')}</Button></div>
            {editor.id && (
              <div>
                <p>{editor.master_name
                  ? `${editor.master_name} · ${editor.pixel_width} × ${editor.pixel_height} px`
                  : t('Sin archivo maestro', 'No master file')}</p>
                <FileUploaderButton key={editor.revision} id="digital-master" disableLabelChanges accept={['image/jpeg', 'image/png']}
                  labelText={t('Seleccionar archivo', 'Select file')}
                  onChange={event => setFile(event.target.files?.[0] || null)} />
                {file && <p>{file.name}</p>}
                <Button type="button" kind="secondary" disabled={busy || !file} onClick={upload}>
                  {editor.master_name ? t('Reemplazar archivo', 'Replace file') : t('Cargar archivo', 'Upload file')}
                </Button>
              </div>
            )}
          </fieldset>
        </form>
      )}
    </section>
  )
}
