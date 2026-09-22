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
  Toggle,
  Button,
  InlineNotification,
  InlineLoading,
  TextArea
} from '@carbon/react'
import { ArrowLeft, Save, TrashCan, Add } from '@carbon/icons-react'
import styles from './EditArtwork.module.css'

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
      <div className={styles.loading}>
        <InlineLoading description="Cargando datos de la obra…" />
      </div>
    )
  }

  return (
    <main className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Panel administrativo — Estudio JBU</p>
            <h1 className={styles.title}>
              Editar obra
              {formData.sku && <span className={styles.sku}>{formData.sku.toUpperCase()}</span>}
            </h1>
          </div>
          <Button as={Link} href="/admin/artworks" kind="ghost" size="md" renderIcon={ArrowLeft}>
            Volver al inventario
          </Button>
        </header>

        <div className={styles.stack}>
          {errorMsg && (
            <InlineNotification kind="error" title="No se pudieron guardar los cambios" subtitle={errorMsg} lowContrast />
          )}
          {successMsg && (
            <InlineNotification kind="success" title="Cambios guardados" subtitle={successMsg} lowContrast />
          )}

          <form onSubmit={handleSubmit} className={styles.form}>
            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <div>
                  <h2 className={styles.sectionTitle}>Identificación de la obra</h2>
                  <p className={styles.sectionHelp}>Información principal que aparecerá en inventario, catálogo y certificado.</p>
                </div>
              </div>
              <div className={styles.grid2}>
                <TextInput id="title" name="title" labelText="Título" value={formData.title} onChange={handleChange} required />
                <TextInput id="sku" name="sku" labelText="SKU" value={formData.sku} onChange={handleChange} required />
                <div>
                  <div className={styles.sectionHead}>
                    <span className={styles.sectionTitle}>Serie</span>
                    <Button type="button" kind="ghost" size="sm" renderIcon={Add} onClick={() => setIsSeriesModalOpen(true)}>Crear serie</Button>
                  </div>
                  <Select id="series" name="series" value={formData.series} onChange={handleChange} labelText="" hideLabel>
                    {seriesList.map((s) => <SelectItem key={s.id} value={s.title.toUpperCase()} text={s.title.toUpperCase()} />)}
                  </Select>
                </div>
                <EnumSelect enumName="artwork_status" label="Estatus del catálogo" name="status" value={formData.status} onChange={handleChange} />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <div><h2 className={styles.sectionTitle}>Publicación</h2><p className={styles.sectionHelp}>Controla si la pieza aparece en los espacios destacados.</p></div>
              </div>
              <div className={styles.toggleRow}>
                <div><p className={styles.sectionTitle}>Obra destacada</p><p className={styles.sectionHelp}>Se mostrará en las secciones principales de la galería.</p></div>
                <Toggle id="featured" labelText="Obra destacada" labelA="No" labelB="Sí" hideLabel toggled={formData.featured} onToggle={(checked) => setFormData(prev => ({ ...prev, featured: checked }))} />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Precio y ficha técnica</h2></div></div>
              <div className={styles.grid4}>
                <TextInput id="base_price_mxn" name="base_price_mxn" type="number" labelText="Precio base (MXN)" value={formData.base_price_mxn} onChange={handleChange} />
                <TextInput id="calculated_price_mxn" name="calculated_price_mxn" type="number" labelText="Precio calculado (MXN)" value={formData.calculated_price_mxn} onChange={handleChange} />
                <TextInput id="current_tier" name="current_tier" type="number" labelText="Nivel actual" value={formData.current_tier} onChange={handleChange} />
                <TextInput id="tier_multiplier" name="tier_multiplier" type="number" step="0.01" labelText="Multiplicador" value={formData.tier_multiplier} onChange={handleChange} />
              </div>
              <div className={styles.grid3} style={{ marginTop: '1rem' }}>
                <TextInput id="year" name="year" type="number" labelText="Año" value={formData.year} onChange={handleChange} />
                <TextInput id="medium" name="medium" labelText="Técnica / medio" value={formData.medium} onChange={handleChange} />
                <TextInput id="dimensions" name="dimensions" labelText="Dimensiones" placeholder="Ej. 50 x 70 cm" value={formData.dimensions} onChange={handleChange} />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <TextArea id="description" name="description" labelText="Descripción" rows={4} value={formData.description} onChange={handleChange} />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <div><h2 className={styles.sectionTitle}>Fotografía principal</h2><p className={styles.sectionHelp}>Arrastra una imagen o selecciónala. La vista previa conserva la obra completa sin recortarla.</p></div>
              </div>
              <div className={styles.uploaderPanel}>
                <ImageUploader currentUrl={getFormattedImageUrl(formData.primary_image_url)} onUploadComplete={(url) => setFormData(prev => ({ ...prev, primary_image_url: url }))} />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}>
                <div><h2 className={styles.sectionTitle}>Galería adicional</h2><p className={styles.sectionHelp}>Detalles, enmarcado y ángulos alternativos de la pieza.</p></div>
                <Button type="button" size="sm" kind="secondary" renderIcon={Add} onClick={handleAddAdditionalImage}>Agregar imagen</Button>
              </div>
              <div className={styles.gallery}>
                {additionalImages.filter(img => !img.isDeleted).length === 0 && <p className={styles.empty}>No hay imágenes adicionales registradas.</p>}
                {additionalImages.map((img, index) => {
                  if (img.isDeleted) return null
                  return (
                    <article key={img.id || `new-${index}`} className={styles.galleryItem}>
                      <div className={styles.galleryItemHead}>
                        <span className={styles.galleryIndex}>Imagen {index + 1}</span>
                        <Button type="button" size="sm" kind="danger--ghost" renderIcon={TrashCan} hasIconOnly iconDescription="Eliminar imagen" onClick={() => handleRemoveAdditionalImage(index)} />
                      </div>
                      <div className={styles.galleryFields}>
                        <ImageUploader currentUrl={getFormattedImageUrl(img.image_url)} onUploadComplete={(url) => handleUpdateAdditionalImage(index, 'image_url', url)} />
                        <div className={styles.sideFields}>
                          <TextInput id={`caption-${index}`} labelText="Descripción / leyenda" placeholder="Ej. Detalle de textura" value={img.caption || ''} onChange={(e) => handleUpdateAdditionalImage(index, 'caption', e.target.value)} />
                          <TextInput id={`order-${index}`} type="number" labelText="Orden de visualización" value={img.display_order ?? index} onChange={(e) => handleUpdateAdditionalImage(index, 'display_order', Number(e.target.value))} />
                        </div>
                      </div>
                    </article>
                  )
                })}
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Propiedad y certificado</h2></div></div>
              <div className={styles.grid2}>
                <EnumSelect enumName="ownership_status" label="Estatus de propiedad" name="ownership_status" value={formData.ownership_status} onChange={handleChange} />
                <TextInput id="claim_token" name="claim_token" labelText="Código de reclamación" value={formData.claim_token} onChange={handleChange} />
                <TextInput id="current_owner_id" name="current_owner_id" labelText="Propietario actual (UUID)" value={formData.current_owner_id} onChange={handleChange} />
                <TextInput id="pending_owner_id" name="pending_owner_id" labelText="Propietario pendiente (UUID)" value={formData.pending_owner_id} onChange={handleChange} />
                <TextInput id="certificate_hash" name="certificate_hash" labelText="Hash del certificado" value={formData.certificate_hash} onChange={handleChange} />
                <TextInput id="certificate_issued_at" name="certificate_issued_at" type="datetime-local" labelText="Fecha de emisión" value={formData.certificate_issued_at} onChange={handleChange} />
              </div>
              <div style={{ marginTop: '1rem' }}>
                <TextArea id="claim_notes" name="claim_notes" labelText="Notas de reclamación" rows={3} value={formData.claim_notes} onChange={handleChange} />
              </div>
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Mercado secundario</h2></div></div>
              <div className={styles.toggleRow}>
                <div><p className={styles.sectionTitle}>Habilitar reventa</p><p className={styles.sectionHelp}>Indica si el propietario actual ofrece la obra.</p></div>
                <Toggle id="is_for_resale" labelText="Habilitar reventa" labelA="No" labelB="Sí" hideLabel toggled={formData.is_for_resale} onToggle={(checked) => setFormData(prev => ({ ...prev, is_for_resale: checked }))} />
              </div>
              {formData.is_for_resale && (
                <div className={styles.grid2} style={{ marginTop: '1rem' }}>
                  <TextInput id="resale_price_mxn" name="resale_price_mxn" type="number" labelText="Precio de reventa (MXN)" value={formData.resale_price_mxn} onChange={handleChange} />
                  <TextInput id="resale_checkout_url" name="resale_checkout_url" type="url" labelText="Enlace de pago" value={formData.resale_checkout_url} onChange={handleChange} />
                </div>
              )}
            </section>

            <section className={styles.section}>
              <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Impresiones</h2></div></div>
              <div className={styles.toggleRow}>
                <div><p className={styles.sectionTitle}>Disponible para impresiones</p><p className={styles.sectionHelp}>Permite ofrecer reproducciones aunque la obra original esté vendida.</p></div>
                <Toggle id="allows_prints" labelText="Disponible para impresiones" labelA="No" labelB="Sí" hideLabel toggled={formData.allows_prints} onToggle={(checked) => setFormData(prev => ({ ...prev, allows_prints: checked }))} />
              </div>
              {formData.allows_prints && (
                <div className={styles.grid4} style={{ marginTop: '1rem' }}>
                  <Select id="print_type" name="print_type" labelText="Tipo de edición" value={formData.print_type} onChange={handleChange}><SelectItem value="OPEN" text="Abierta" /><SelectItem value="LIMITED" text="Limitada" /></Select>
                  <TextInput id="print_edition_size" name="print_edition_size" type="number" labelText="Tamaño de edición" value={formData.print_edition_size} onChange={handleChange} />
                  <TextInput id="prints_sold" name="prints_sold" type="number" labelText="Impresiones vendidas" value={formData.prints_sold} onChange={handleChange} />
                  <TextInput id="print_price_mxn" name="print_price_mxn" type="number" labelText="Precio (MXN)" value={formData.print_price_mxn} onChange={handleChange} />
                </div>
              )}
            </section>

            <div className={styles.submit}>
              <Button type="submit" disabled={saving} renderIcon={Save} className={styles.submitButton}>
                {saving ? 'Guardando cambios…' : 'Guardar cambios'}
              </Button>
            </div>
          </form>

          {formData.allows_prints && id && (
            <section className={styles.variants}>
              <div className={styles.sectionHead}><div><h2 className={styles.sectionTitle}>Opciones y precios de impresiones</h2><p className={styles.sectionHelp}>Gestiona tamaños, materiales y precios disponibles.</p></div></div>
              <PrintVariantsManager artworkId={id} />
            </section>
          )}
        </div>
      </div>

      <CreateSeriesModal isOpen={isSeriesModalOpen} onClose={() => setIsSeriesModalOpen(false)} onSeriesCreated={handleSeriesCreated} />
    </main>
  )
}
