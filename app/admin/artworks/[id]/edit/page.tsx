'use client'

import { useState, useEffect, use } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import ImageUploader from '../../components/ImageUploader'
import CreateSeriesModal from '@/components/CreateSeriesModal'
import PrintVariantsManager from '@/components/admin/PrintVariantsManager'
import EnumSelect from '@/components/ui/EnumSelect'
import Link from 'next/link'

import {
  TextInput,
  Select,
  SelectItem,
  Checkbox,
  Button,
  InlineNotification,
  Loading,
  Stack,
  Form
} from '@carbon/react'
import { ArrowLeft, Save, TrashCan, Add } from '@carbon/icons-react'

interface AdditionalImage {
  id?: string // Si ya existe en la BD
  image_url: string
  display_order: number
  caption: string
  isNew?: boolean
  isDeleted?: boolean
}

export default function EditArtworkPage({ params }: { params: Promise<{ id: string }> }) {
  const resolvedParams = use(params)
  const id = resolvedParams?.id

  const router = useRouter()

  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [errorMsg, setErrorMsg] = useState('')
  const [successMsg, setSuccessMsg] = useState('')

  const [seriesList, setSeriesList] = useState<{ id: string; title: string }[]>([])
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false)

  // Estado para imágenes adicionales
  const [additionalImages, setAdditionalImages] = useState<AdditionalImage[]>([])

  const [formData, setFormData] = useState({
    title: '',
    sku: '',
    series: 'DECO',
    series_id: '',
    medium: '',
    year: new Date().getFullYear(),
    dimensions: '',
    primary_image_url: '',
    description: '',
    status: 'DRAFT',
    featured: false,

    base_price_mxn: '',
    calculated_price_mxn: '',
    current_tier: 0,
    tier_multiplier: 1.0,

    is_for_resale: false,
    resale_price_mxn: '',
    resale_checkout_url: '',

    ownership_status: 'AVAILABLE',
    current_owner_id: '',
    pending_owner_id: '',
    claim_token: '',
    claim_notes: '',
    certificate_hash: '',
    certificate_issued_at: '',

    allows_prints: false,
    print_type: 'OPEN',
    print_edition_size: '',
    prints_sold: 0,
    print_price_mxn: ''
  })

  useEffect(() => {
    if (!id) return

    const fetchArtworkAndSeries = async () => {
      setLoading(true)

      const { data: seriesData } = await supabase
        .from('series')
        .select('id, title')
        .order('title', { ascending: true })

      if (seriesData && seriesData.length > 0) {
        setSeriesList(seriesData)
      } else {
        setSeriesList([
          { id: '1', title: 'DECO' },
          { id: '2', title: 'FLOW' },
          { id: '3', title: 'ORBITALS' },
          { id: '4', title: 'ART TOYS' },
          { id: '5', title: 'EDICIÓN ESPECIAL' }
        ])
      }

      // Obtener la obra
      const { data: artwork, error } = await supabase
        .from('artworks')
        .select('*')
        .eq('id', id)
        .single()

      // Obtener las imágenes adicionales de la obra
      const { data: imagesData } = await supabase
        .from('artwork_images')
        .select('*')
        .eq('artwork_id', id)
        .order('display_order', { ascending: true })

      if (imagesData) {
        setAdditionalImages(imagesData)
      }

      if (error || !artwork) {
        setErrorMsg('No se encontró la obra especificada.')
      } else {
        setFormData({
          title: artwork.title || '',
          sku: artwork.sku || '',
          series: artwork.series || 'DECO',
          series_id: artwork.series_id || '',
          medium: artwork.medium || '',
          year: artwork.year || new Date().getFullYear(),
          dimensions: artwork.dimensions || '',
          primary_image_url: artwork.primary_image_url || '',
          description: artwork.description || '',
          status: artwork.status ? artwork.status.toUpperCase() : 'DRAFT',
          featured: artwork.featured ?? false,

          base_price_mxn: artwork.base_price_mxn ?? '',
          calculated_price_mxn: artwork.calculated_price_mxn ?? '',
          current_tier: artwork.current_tier ?? 0,
          tier_multiplier: artwork.tier_multiplier ?? 1.0,

          is_for_resale: artwork.is_for_resale ?? false,
          resale_price_mxn: artwork.resale_price_mxn ?? '',
          resale_checkout_url: artwork.resale_checkout_url || '',

          ownership_status: artwork.ownership_status ? artwork.ownership_status.toUpperCase() : 'AVAILABLE',
          current_owner_id: artwork.current_owner_id || '',
          pending_owner_id: artwork.pending_owner_id || '',
          claim_token: artwork.claim_token || '',
          claim_notes: artwork.claim_notes || '',
          certificate_hash: artwork.certificate_hash || '',
          certificate_issued_at: artwork.certificate_issued_at ? new Date(artwork.certificate_issued_at).toISOString().slice(0, 16) : '',

          allows_prints: artwork.allows_prints ?? false,
          print_type: artwork.print_type || 'OPEN',
          print_edition_size: artwork.print_edition_size ?? '',
          prints_sold: artwork.prints_sold ?? 0,
          print_price_mxn: artwork.print_price_mxn ?? ''
        })
      }

      setLoading(false)
    }

    fetchArtworkAndSeries()
  }, [id, router])

  const handleSeriesCreated = (newSeries: { id: string; title: string }) => {
    const formattedTitle = newSeries.title.toUpperCase()
    setSeriesList((prev) =>
      [...prev, { id: newSeries.id, title: formattedTitle }].sort((a, b) =>
        a.title.localeCompare(b.title)
      )
    )
    setFormData((prev) => ({ ...prev, series: formattedTitle, series_id: newSeries.id }))
  }

  const handleChange = (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement>) => {
    const target = e.target as HTMLInputElement
    const { name, value, type, checked } = target
    setFormData((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value
    }))
  }

  const getFormattedImageUrl = (url: string) => {
    if (!url) return ''
    if (url.startsWith('http://') || url.startsWith('https://') || url.startsWith('/')) {
      return url
    }
    return `/${url}`
  }

  // Manejo de Imágenes Adicionales
  const handleAddAdditionalImage = () => {
    setAdditionalImages((prev) => [
      ...prev,
      {
        image_url: '',
        display_order: prev.length,
        caption: '',
        isNew: true
      }
    ])
  }

  const handleUpdateAdditionalImage = (index: number, field: string, value: any) => {
    setAdditionalImages((prev) => {
      const updated = [...prev]
      updated[index] = { ...updated[index], [field]: value }
      return updated
    })
  }

  const handleRemoveAdditionalImage = (index: number) => {
    setAdditionalImages((prev) => {
      const target = prev[index]
      if (target.id) {
        // Si ya existe en BD, lo marcamos para eliminar
        return prev.map((img, i) => (i === index ? { ...img, isDeleted: true } : img))
      } else {
        // Si era nuevo y no se ha guardado, lo removemos del arreglo directamente
        return prev.filter((_, i) => i !== index)
      }
    })
  }

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault()
    setSaving(true)
    setErrorMsg('')
    setSuccessMsg('')

    const updatePayload = {
      title: formData.title.trim(),
      sku: formData.sku.trim(),
      series: formData.series,
      series_id: formData.series_id || null,
      medium: formData.medium.trim(),
      year: Number(formData.year),
      dimensions: formData.dimensions.trim(),
      primary_image_url: formData.primary_image_url,
      description: formData.description.trim(),
      status: formData.status,
      featured: formData.featured,

      base_price_mxn: formData.base_price_mxn !== '' ? Number(formData.base_price_mxn) : 0,
      calculated_price_mxn: formData.calculated_price_mxn !== '' ? Number(formData.calculated_price_mxn) : (formData.base_price_mxn !== '' ? Number(formData.base_price_mxn) : 0),
      current_tier: Number(formData.current_tier),
      tier_multiplier: Number(formData.tier_multiplier),

      is_for_resale: formData.is_for_resale,
      resale_price_mxn: formData.resale_price_mxn !== '' ? Number(formData.resale_price_mxn) : null,
      resale_checkout_url: formData.resale_checkout_url.trim() || null,

      ownership_status: formData.ownership_status,
      current_owner_id: formData.current_owner_id.trim() || null,
      pending_owner_id: formData.pending_owner_id.trim() || null,
      claim_token: formData.claim_token.trim() || null,
      claim_notes: formData.claim_notes.trim() || null,
      certificate_hash: formData.certificate_hash.trim() || null,
      certificate_issued_at: formData.certificate_issued_at ? new Date(formData.certificate_issued_at).toISOString() : null,

      allows_prints: formData.allows_prints,
      print_type: formData.print_type,
      print_edition_size: formData.print_edition_size !== '' ? Number(formData.print_edition_size) : null,
      prints_sold: Number(formData.prints_sold),
      print_price_mxn: formData.print_price_mxn !== '' ? Number(formData.print_price_mxn) : null,

      updated_at: new Date().toISOString()
    }

    // 1. Actualizar la obra principal
    const { error: artworkError } = await supabase
      .from('artworks')
      .update(updatePayload)
      .eq('id', id)

    if (artworkError) {
      setErrorMsg('Error al actualizar obra: ' + artworkError.message)
      setSaving(false)
      return
    }

    // 2. Procesar imágenes adicionales (crear, actualizar, eliminar)
    for (const [index, img] of additionalImages.entries()) {
      if (img.isDeleted && img.id) {
        await supabase.from('artwork_images').delete().eq('id', img.id)
      } else if (img.isNew && !img.isDeleted && img.image_url) {
        await supabase.from('artwork_images').insert({
          artwork_id: id,
          image_url: img.image_url,
          display_order: index,
          caption: img.caption || null
        })
      } else if (img.id && !img.isDeleted) {
        await supabase.from('artwork_images').update({
          image_url: img.image_url,
          display_order: index,
          caption: img.caption || null
        }).eq('id', img.id)
      }
    }

    // Recargar imágenes actualizadas desde la base de datos
    const { data: refreshedImages } = await supabase
      .from('artwork_images')
      .select('*')
      .eq('artwork_id', id)
      .order('display_order', { ascending: true })

    if (refreshedImages) {
      setAdditionalImages(refreshedImages)
    }

    setSuccessMsg('Obra e imágenes actualizadas correctamente.')
    window.scrollTo({ top: 0, behavior: 'smooth' })
    setSaving(false)
  }

  if (loading) {
    return (
      <div className="cds--theme--g100" style={{ minHeight: '100vh', display: 'flex', alignItems: 'center', justifyContent: 'center', backgroundColor: 'var(--cds-background)' }}>
        <Loading description="Cargando datos de la obra..." />
      </div>
    )
  }

  return (
    <div className="cds--theme--g100" style={{ minHeight: '100vh', width: '100%', backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)', padding: '2rem 1rem' }}>
      <div style={{ maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
        
        <Stack gap={7}>
          {/* Encabezado */}
          <div style={{ borderBottom: '1px solid var(--cds-border-subtle01)', paddingBottom: '1.5rem' }}>
            <Link
              href="/admin/artworks"
              style={{
                display: 'inline-flex',
                alignItems: 'center',
                gap: '0.5rem',
                fontSize: '0.75rem',
                textTransform: 'uppercase',
                letterSpacing: '0.1em',
                color: 'var(--cds-link-primary)',
                textDecoration: 'none',
                marginBottom: '0.5rem'
              }}
            >
              <ArrowLeft size={16} /> Volver al Inventario
            </Link>
            <h1 style={{ fontSize: '2rem', fontWeight: 300, margin: 0 }}>
              Editar Obra {formData.sku && <span style={{ fontSize: '0.875rem', fontFamily: 'monospace', color: 'var(--cds-text-secondary)' }}>({formData.sku.toUpperCase()})</span>}
            </h1>
          </div>

          {/* Notificaciones */}
          {errorMsg && (
            <InlineNotification kind="error" title="Error" subtitle={errorMsg} lowContrast />
          )}

          {successMsg && (
            <InlineNotification kind="success" title="Éxito" subtitle={successMsg} lowContrast />
          )}

          {/* Formulario Principal */}
          <Form onSubmit={handleSubmit}>
            <div style={{
              backgroundColor: 'var(--cds-layer-01)',
              border: '1px solid var(--cds-border-subtle01)',
              padding: '2.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1.5rem',
              borderRadius: '0.5rem',
              width: '100%',
              boxSizing: 'border-box'
            }}>
              
              {/* INFORMACIÓN BÁSICA Y SKU */}
              <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                <TextInput
                  id="title"
                  name="title"
                  labelText="Título"
                  value={formData.title}
                  onChange={handleChange}
                  required
                />
                <TextInput
                  id="sku"
                  name="sku"
                  labelText="SKU"
                  value={formData.sku}
                  onChange={handleChange}
                  required
                />
              </div>

              {/* SERIE Y ESTATUS DE PUBLICACIÓN */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                <div>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '0.25rem' }}>
                    <label style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', textTransform: 'uppercase' }}>Serie</label>
                    <button
                      type="button"
                      onClick={() => setIsSeriesModalOpen(true)}
                      style={{ background: 'none', border: 'none', color: 'var(--cds-link-primary)', fontSize: '0.75rem', cursor: 'pointer', padding: 0 }}
                    >
                      + Crear Serie
                    </button>
                  </div>
                  <Select
                    id="series"
                    name="series"
                    value={formData.series}
                    onChange={handleChange}
                    labelText=""
                  >
                    {seriesList.map((s) => (
                      <SelectItem key={s.id} value={s.title.toUpperCase()} text={s.title.toUpperCase()} />
                    ))}
                  </Select>
                </div>
                <div>
                  <EnumSelect
                    enumName="artwork_status"
                    label="Estatus Catálogo"
                    name="status"
                    value={formData.status}
                    onChange={handleChange}
                  />
                </div>
              </div>

              {/* DESTACAR Y VISIBILIDAD */}
              <div style={{
                backgroundColor: 'var(--cds-layer-02)',
                border: '1px solid var(--cds-border-subtle01)',
                padding: '1rem',
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                borderRadius: '0.25rem'
              }}>
                <div>
                  <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--cds-text-primary)' }}>
                    Obra Destacada (Featured)
                  </span>
                  <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0.25rem 0 0 0' }}>
                    Mostrará esta obra en las secciones principales del portal.
                  </p>
                </div>
                <Checkbox
                  id="featured"
                  name="featured"
                  labelText=""
                  checked={formData.featured}
                  onChange={(_e, { checked }) => setFormData(prev => ({ ...prev, featured: checked }))}
                />
              </div>

              {/* PRECIOS Y NIVELES */}
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem' }}>
                <TextInput
                  id="base_price_mxn"
                  name="base_price_mxn"
                  type="number"
                  labelText="Precio Base (MXN)"
                  value={formData.base_price_mxn}
                  onChange={handleChange}
                />
                <TextInput
                  id="calculated_price_mxn"
                  name="calculated_price_mxn"
                  type="number"
                  labelText="Precio Calculado (MXN)"
                  value={formData.calculated_price_mxn}
                  onChange={handleChange}
                />
                <TextInput
                  id="current_tier"
                  name="current_tier"
                  type="number"
                  labelText="Tier Actual"
                  value={formData.current_tier}
                  onChange={handleChange}
                />
                <TextInput
                  id="tier_multiplier"
                  name="tier_multiplier"
                  type="number"
                  step="0.01"
                  labelText="Multiplicador Tier"
                  value={formData.tier_multiplier}
                  onChange={handleChange}
                />
              </div>

              {/* DETALLES FÍSICOS */}
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 2fr 2fr', gap: '1rem' }}>
                <TextInput
                  id="year"
                  name="year"
                  type="number"
                  labelText="Año"
                  value={formData.year}
                  onChange={handleChange}
                />
                <TextInput
                  id="medium"
                  name="medium"
                  labelText="Técnica / Medio"
                  value={formData.medium}
                  onChange={handleChange}
                />
                <TextInput
                  id="dimensions"
                  name="dimensions"
                  labelText="Dimensiones"
                  placeholder="e.g. 50 x 70 cm"
                  value={formData.dimensions}
                  onChange={handleChange}
                />
              </div>

              {/* MULTIMEDIA: IMAGEN PRINCIPAL */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>URL Imagen Principal</label>
                <ImageUploader
                  currentUrl={getFormattedImageUrl(formData.primary_image_url)}
                  onUploadComplete={(url) => setFormData((prev) => ({ ...prev, primary_image_url: url }))}
                />
              </div>

              {/* MULTIMEDIA: IMÁGENES ADICIONALES (GALERÍA) */}
              <div style={{ borderTop: '1px solid var(--cds-border-subtle01)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--cds-link-primary)', margin: 0 }}>
                      Imágenes Adicionales / Galería
                    </h3>
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0.25rem 0 0 0' }}>
                      Agrega fotos de detalles, enmarcado o ángulos alternativos.
                    </p>
                  </div>
                  <Button
                    type="button"
                    size="sm"
                    kind="secondary"
                    renderIcon={Add}
                    onClick={handleAddAdditionalImage}
                  >
                    Agregar Imagen
                  </Button>
                </div>

                {additionalImages.filter(img => !img.isDeleted).length === 0 && (
                  <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontStyle: 'italic' }}>
                    No hay imágenes adicionales registradas.
                  </p>
                )}

                {additionalImages.map((img, index) => {
                  if (img.isDeleted) return null
                  return (
                    <div key={img.id || `new-${index}`} style={{
                      backgroundColor: 'var(--cds-layer-02)',
                      border: '1px solid var(--cds-border-subtle01)',
                      padding: '1rem',
                      display: 'flex',
                      flexDirection: 'column',
                      gap: '1rem',
                      borderRadius: '0.25rem'
                    }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                        <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', textTransform: 'uppercase' }}>
                          Imagen #{index + 1}
                        </span>
                        <Button
                          type="button"
                          size="sm"
                          kind="danger--ghost"
                          renderIcon={TrashCan}
                          hasIconOnly
                          iconDescription="Eliminar imagen"
                          onClick={() => handleRemoveAdditionalImage(index)}
                        />
                      </div>

                      <div style={{ display: 'grid', gridTemplateColumns: '2fr 1fr', gap: '1rem' }}>
                        <div>
                          <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>Archivo / URL</label>
                          <ImageUploader
                            currentUrl={getFormattedImageUrl(img.image_url)}
                            onUploadComplete={(url) => handleUpdateAdditionalImage(index, 'image_url', url)}
                          />
                        </div>
                        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                          <TextInput
                            id={`caption-${index}`}
                            labelText="Descripción / Leyenda"
                            placeholder="Ej. Detalle de textura"
                            value={img.caption || ''}
                            onChange={(e) => handleUpdateAdditionalImage(index, 'caption', e.target.value)}
                          />
                          <TextInput
                            id={`order-${index}`}
                            type="number"
                            labelText="Orden de visualización"
                            value={img.display_order ?? index}
                            onChange={(e) => handleUpdateAdditionalImage(index, 'display_order', Number(e.target.value))}
                          />
                        </div>
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* DESCRIPCIÓN */}
              <div>
                <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem', textTransform: 'uppercase' }}>Descripción</label>
                <textarea
                  name="description"
                  rows={3}
                  value={formData.description}
                  onChange={handleChange}
                  style={{
                    width: '100%',
                    backgroundColor: 'var(--cds-field)',
                    border: '1px solid var(--cds-border-strong01)',
                    color: 'var(--cds-text-primary)',
                    padding: '0.75rem',
                    fontSize: '0.875rem',
                    fontFamily: 'inherit',
                    boxSizing: 'border-box'
                  }}
                />
              </div>

              {/* PROPIEDAD Y CERTIFICADO */}
              <div style={{ borderTop: '1px solid var(--cds-border-subtle01)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <h3 style={{ fontSize: '0.875rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--cds-link-primary)', margin: 0 }}>
                  Estatus de Propiedad y Certificados
                </h3>
                
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <EnumSelect
                    enumName="ownership_status"
                    label="Estatus Propiedad"
                    name="ownership_status"
                    value={formData.ownership_status}
                    onChange={handleChange}
                  />
                  <TextInput
                    id="claim_token"
                    name="claim_token"
                    labelText="Claim Token"
                    value={formData.claim_token}
                    onChange={handleChange}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <TextInput
                    id="current_owner_id"
                    name="current_owner_id"
                    labelText="Propietario Actual (User UUID)"
                    placeholder="UUID del usuario"
                    value={formData.current_owner_id}
                    onChange={handleChange}
                  />
                  <TextInput
                    id="pending_owner_id"
                    name="pending_owner_id"
                    labelText="Propietario Pendiente (User UUID)"
                    placeholder="UUID del usuario pendiente"
                    value={formData.pending_owner_id}
                    onChange={handleChange}
                  />
                </div>

                <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                  <TextInput
                    id="certificate_hash"
                    name="certificate_hash"
                    labelText="Hash de Certificado"
                    value={formData.certificate_hash}
                    onChange={handleChange}
                  />
                  <TextInput
                    id="certificate_issued_at"
                    name="certificate_issued_at"
                    type="datetime-local"
                    labelText="Fecha Emisión Certificado"
                    value={formData.certificate_issued_at}
                    onChange={handleChange}
                  />
                </div>

                <div>
                  <label style={{ display: 'block', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '0.25rem' }}>Notas de Claim / Reclamación</label>
                  <textarea
                    name="claim_notes"
                    rows={2}
                    value={formData.claim_notes}
                    onChange={handleChange}
                    style={{
                      width: '100%',
                      backgroundColor: 'var(--cds-field)',
                      border: '1px solid var(--cds-border-strong01)',
                      color: 'var(--cds-text-primary)',
                      padding: '0.75rem',
                      fontSize: '0.875rem',
                      fontFamily: 'inherit',
                      boxSizing: 'border-box'
                    }}
                  />
                </div>
              </div>

              {/* REVENTA Y MERCADO SECUNDARIO */}
              <div style={{ borderTop: '1px solid var(--cds-border-subtle01)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  backgroundColor: 'var(--cds-layer-02)',
                  border: '1px solid var(--cds-border-subtle01)',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: '0.25rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--cds-text-primary)' }}>
                      Habilitar Reventa / Mercado Secundario
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0.25rem 0 0 0' }}>
                      Indica si el propietario actual la tiene listada en reventa.
                    </p>
                  </div>
                  <Checkbox
                    id="is_for_resale"
                    name="is_for_resale"
                    labelText=""
                    checked={formData.is_for_resale}
                    onChange={(_e, { checked }) => setFormData(prev => ({ ...prev, is_for_resale: checked }))}
                  />
                </div>

                {formData.is_for_resale && (
                  <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '1rem' }}>
                    <TextInput
                      id="resale_price_mxn"
                      name="resale_price_mxn"
                      type="number"
                      labelText="Precio Reventa (MXN)"
                      value={formData.resale_price_mxn}
                      onChange={handleChange}
                    />
                    <TextInput
                      id="resale_checkout_url"
                      name="resale_checkout_url"
                      type="url"
                      labelText="URL Checkout Reventa"
                      value={formData.resale_checkout_url}
                      onChange={handleChange}
                    />
                  </div>
                )}
              </div>

              {/* CONFIGURACIÓN GLOBAL DE PRINTS */}
              <div style={{ borderTop: '1px solid var(--cds-border-subtle01)', paddingTop: '1.5rem', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
                <div style={{
                  backgroundColor: 'var(--cds-layer-02)',
                  border: '1px solid var(--cds-border-subtle01)',
                  padding: '1rem',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'space-between',
                  borderRadius: '0.25rem'
                }}>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontFamily: 'monospace', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--cds-text-primary)' }}>
                      Disponible para Impresiones / Prints
                    </span>
                    <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0.25rem 0 0 0' }}>
                      Permite que los clientes compren reproducciones aun si la obra original está vendida.
                    </p>
                  </div>
                  <Checkbox
                    id="allows_prints"
                    name="allows_prints"
                    labelText=""
                    checked={formData.allows_prints}
                    onChange={(_e, { checked }) => setFormData(prev => ({ ...prev, allows_prints: checked }))}
                  />
                </div>

                {formData.allows_prints && (
                  <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4, 1fr)', gap: '1rem', backgroundColor: 'var(--cds-layer-02)', padding: '1rem', border: '1px solid var(--cds-border-subtle01)' }}>
                    <Select
                      id="print_type"
                      name="print_type"
                      labelText="Tipo de Edición"
                      value={formData.print_type}
                      onChange={handleChange}
                    >
                      <SelectItem value="OPEN" text="OPEN (Abierta)" />
                      <SelectItem value="LIMITED" text="LIMITED (Limitada)" />
                    </Select>
                    <TextInput
                      id="print_edition_size"
                      name="print_edition_size"
                      type="number"
                      labelText="Tamaño Edición"
                      placeholder="Ej: 50"
                      value={formData.print_edition_size}
                      onChange={handleChange}
                    />
                    <TextInput
                      id="prints_sold"
                      name="prints_sold"
                      type="number"
                      labelText="Prints Vendidos"
                      value={formData.prints_sold}
                      onChange={handleChange}
                    />
                    <TextInput
                      id="print_price_mxn"
                      name="print_price_mxn"
                      type="number"
                      labelText="Precio Print"
                      placeholder="MXN"
                      value={formData.print_price_mxn}
                      onChange={handleChange}
                    />
                  </div>
                )}
              </div>

              <div style={{ paddingTop: '1rem' }}>
                <Button
                  type="submit"
                  disabled={saving}
                  renderIcon={() => <Save size={16} />}
                  style={{ width: '100%', justifyContent: 'center' }}
                >
                  {saving ? 'Guardando Cambios...' : 'Guardar Cambios'}
                </Button>
              </div>

            </div>
          </Form>

          {/* SECCIÓN ADMINISTRADORA DE VARIANTES DE PRINTS */}
          {formData.allows_prints && id && (
            <div style={{
              backgroundColor: 'var(--cds-layer-01)',
              border: '1px solid var(--cds-border-subtle01)',
              padding: '2rem',
              borderRadius: '0.5rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '1rem'
            }}>
              <div>
                <h2 style={{ fontSize: '1rem', fontWeight: 'bold', textTransform: 'uppercase', color: 'var(--cds-link-primary)', margin: 0 }}>
                  Opciones y Precios de Prints
                </h2>
                <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0.25rem 0 0 0' }}>
                  Gestiona los tamaños, materiales y precios disponibles para las reproducciones de esta obra.
                </p>
              </div>

              <PrintVariantsManager artworkId={id} />
            </div>
          )}

        </Stack>

      </div>

      <CreateSeriesModal
        isOpen={isSeriesModalOpen}
        onClose={() => setIsSeriesModalOpen(false)}
        onSeriesCreated={handleSeriesCreated}
      />
    </div>
  )
}