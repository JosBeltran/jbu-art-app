'use client'

import { useCallback, useEffect, useState } from 'react'
import { Button, InlineNotification, Select, SelectItem, TextInput, TextArea, Toggle } from '@carbon/react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'

type EditionUnit = { id: string; edition_number: number; unit_identifier: string; status: string }
type ArtworkEdition = {
  physical_edition_type?: string
  physical_edition_size?: number | null
  physical_edition_signed?: boolean
  physical_edition_description_es?: string | null
  physical_edition_description_en?: string | null
  physical_edition_sales_enabled?: boolean
}

export default function PhysicalEditionManager({ artworkId }: { artworkId: string }) {
  const { t } = useI18n()
  const [loaded, setLoaded] = useState(false)
  const [supported, setSupported] = useState(true)
  const [type, setType] = useState('UNIQUE')
  const [size, setSize] = useState('50')
  const [signed, setSigned] = useState(true)
  const [descriptionEs, setDescriptionEs] = useState('')
  const [descriptionEn, setDescriptionEn] = useState('')
  const [units, setUnits] = useState<EditionUnit[]>([])
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const [success, setSuccess] = useState('')
  const [salesEnabled, setSalesEnabled] = useState(false)

  const reload = useCallback(async () => {
    const { data, error: loadError } = await supabase.from('artworks')
      .select('physical_edition_type,physical_edition_size,physical_edition_signed,physical_edition_description_es,physical_edition_description_en,physical_edition_sales_enabled')
      .eq('id', artworkId).single()
    if (loadError) {
      setSupported(false)
      setLoaded(true)
      return
    }
    const a = data as ArtworkEdition
    setSupported(true)
    setType(a.physical_edition_type || 'UNIQUE')
    setSize(String(a.physical_edition_size || 50))
    setSigned(a.physical_edition_signed !== false)
    setDescriptionEs(a.physical_edition_description_es || '')
    setDescriptionEn(a.physical_edition_description_en || '')
    setSalesEnabled(Boolean(a.physical_edition_sales_enabled))
    if (a.physical_edition_type === 'LIMITED_EDITION') {
      const { data: list, error: unitError } = await supabase.from('artwork_edition_units')
        .select('id,edition_number,unit_identifier,status').eq('artwork_id', artworkId)
        .order('edition_number', { ascending: true })
      if (unitError) setError(unitError.message)
      else setUnits((list || []) as EditionUnit[])
    } else setUnits([])
    setLoaded(true)
  }, [artworkId])

  useEffect(() => { void reload() }, [reload])

  const save = async () => {
    setError('')
    setSuccess('')
    const parsed = Number(size)
    if (type === 'LIMITED_EDITION' && (!Number.isSafeInteger(parsed) || parsed < 1 || parsed > 10000)) {
      setError(t('El tiraje debe ser un entero entre 1 y 10,000.', 'Edition size must be an integer between 1 and 10,000.'))
      return
    }
    setBusy(true)
    try {
      const { error: rpcError } = await supabase.rpc('configure_physical_edition', {
        _artwork_id: artworkId,
        _type: type,
        _edition_size: type === 'LIMITED_EDITION' ? parsed : null,
        _signed: signed,
        _description_es: descriptionEs,
        _description_en: descriptionEn,
      })
      if (rpcError) throw rpcError
      await reload()
      setSuccess(t('Edición configurada. Las ventas físicas siguen bloqueadas hasta completar la integración.', 'Edition configured. Physical edition sales remain disabled until the integration is complete.'))
    } catch (err: any) {
      setError(err?.message || t('No se pudo configurar la edición.', 'Edition configuration failed.'))
    } finally { setBusy(false) }
  }

  if (!loaded) return <p>{t('Cargando configuración de edición…','Loading edition settings…')}</p>
  if (!supported) return (
    <section style={{ borderTop: '1px solid var(--cds-border-subtle-01)', padding: '1.5rem 0', display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>
          {t('Edición física de la obra', 'Physical artwork edition')}
        </h2>
        <p style={{ color: 'var(--cds-text-secondary)', fontSize: '.875rem' }}>
          {t('Original único o edición limitada de ejemplares numerados, independiente de los Fine Art Prints.',
            'One-of-a-kind original or limited edition of individually numbered pieces, separate from Fine Art Prints.')}
        </p>
      </div>
      <InlineNotification kind="warning" lowContrast hideCloseButton
        title={t('Configuración no disponible todavía', 'Edition settings not available yet')}
        subtitle={t('La base de datos del Preview no tiene aún los campos de ediciones físicas. Aplica primero la migración 20261114 a un entorno de prueba. No ejecutes migraciones en producción solo para activar el Preview.',
          'The Preview database does not yet have the physical edition fields. Apply migration 20261114 to a test environment first. Do not migrate production just to enable this Preview.')} />
      <div style={{ padding: '1rem', border: '1px solid var(--cds-border-subtle-01)', opacity: .65, display: 'grid', gap: '.5rem' }}>
        <strong>{t('Vista previa de la configuración', 'Configuration preview')}</strong>
        <p>{t('Tipo: Original único / Edición física limitada', 'Type: One-of-a-kind / Physical limited edition')}</p>
        <p>{t('Tiraje: 50 ejemplares · Ejemplo: EPOXY-01-013', 'Edition size: 50 units · Example: EPOXY-01-013')}</p>
        <p>{t('Firma individual · Descripción ES/EN · Inventario numerado', 'Individual signature · ES/EN description · Numbered inventory')}</p>
      </div>
    </section>
  )

  const sold = units.filter(u => u.status === 'SOLD').length
  const reserved = units.filter(u => u.status === 'RESERVED').length

  return (
    <section style={{ borderTop: '1px solid var(--cds-border-subtle-01)', padding: '1.5rem 0', display: 'grid', gap: '1rem' }}>
      <div>
        <h2 style={{ fontSize: '1.125rem', fontWeight: 600 }}>{t('Edición física de la obra','Physical artwork edition')}</h2>
        <p style={{ color: 'var(--cds-text-secondary)', fontSize: '.875rem' }}>
          {t('Independiente de los Fine Art Prints. Los originales existentes permanecen como piezas únicas.',
            'Separate from Fine Art Prints. Existing originals remain one-of-a-kind.')}
        </p>
      </div>
      <InlineNotification kind="info" lowContrast hideCloseButton
        title={t('Ventas limitadas temporalmente desactivadas','Limited-edition sales temporarily disabled')}
        subtitle={t('La ficha puede mostrar el tiraje, pero no se venderá una unidad hasta integrar pagos y certificados individuales.',
          'The artwork can show its edition size, but units cannot be sold until payments and individual certificates are integrated.')} />
      {error && <InlineNotification kind="error" lowContrast title={t('Error de edición','Edition error')} subtitle={error} />}
      {success && <InlineNotification kind="success" lowContrast title={t('Configuración guardada','Settings saved')} subtitle={success} />}
      <Select id="physical-edition-type" labelText={t('Tipo de obra física','Physical artwork type')} value={type}
        onChange={event => setType(event.target.value)}>
        <SelectItem value="UNIQUE" text={t('Original único — 1 de 1','One-of-a-kind original — 1 of 1')} />
        <SelectItem value="LIMITED_EDITION" text={t('Edición física limitada','Numbered physical limited edition')} />
      </Select>
      {type === 'LIMITED_EDITION' && (
        <>
          <TextInput id="physical-edition-size" labelText={t('Tiraje total (ej. 50)','Total edition size (e.g. 50)')}
            type="number" min={1} max={10000} step={1} value={size} onChange={event => setSize(event.target.value)} />
          <Toggle id="physical-edition-signed" labelText={t('Firma individual','Individual artist signature')}
            labelA={t('No','No')} labelB={t('Sí','Yes')} toggled={signed} onToggle={setSigned}/>
          <TextArea id="physical-edition-es" labelText={t('Descripción de la edición (ES)','Edition description (Spanish)')}
            rows={2} maxLength={2000} value={descriptionEs} onChange={event => setDescriptionEs(event.target.value)} />
          <TextArea id="physical-edition-en" labelText={t('Descripción de la edición (EN)','Edition description (English)')}
            rows={2} maxLength={2000} value={descriptionEn} onChange={event => setDescriptionEn(event.target.value)} />
        </>
      )}
      <Button type="button" kind="secondary" disabled={busy} onClick={save}>
        {busy ? t('Guardando…','Saving…') : t('Guardar configuración de edición','Save edition configuration')}
      </Button>
      {units.length > 0 && (
        <div style={{ display: 'grid', gap: '.75rem' }}>
          <p><strong>{t('Inventario numerado','Numbered inventory')}:</strong> {units.length} {t('unidades','units')} · {sold} {t('vendidas','sold')} · {reserved} {t('reservadas','reserved')} · {units.length - sold - reserved} {t('disponibles','available')}</p>
          <p style={{ color: 'var(--cds-text-secondary)', fontSize: '.75rem' }}>
            {t('Ventas habilitadas','Sales enabled')}: {salesEnabled ? t('Sí','Yes') : t('No','No')}
          </p>
          <div style={{ maxHeight: '220px', overflow: 'auto', border: '1px solid var(--cds-border-subtle-01)', padding: '.75rem' }}>
            {units.map(unit => (
              <div key={unit.id} style={{ display: 'flex', justifyContent: 'space-between', gap: '1rem', padding: '.25rem 0' }}>
                <code>{unit.unit_identifier}</code><span>{unit.status}</span>
              </div>
            ))}
          </div>
        </div>
      )}
    </section>
  )
}
