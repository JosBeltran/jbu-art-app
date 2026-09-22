'use client'

import { useState, useEffect } from 'react'
import { useRouter } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import Link from 'next/link'
import {
  Button,
  FileUploader,
  InlineLoading,
  InlineNotification,
  NumberInput,
  Select,
  SelectItem,
  Tag,
  TextArea,
  TextInput,
  Toggle,
} from '@carbon/react'
import { ArrowLeft, ArrowUpRight, Add } from '@carbon/icons-react'
import CreateSeriesModal from '@/components/CreateSeriesModal'
import styles from './NewArtwork.module.css'

export default function NewArtworkPage() {
  const router = useRouter()


  const [loading, setLoading] = useState(false)
  const [checkingAuth, setCheckingAuth] = useState(true)
  const [errorMsg, setErrorMsg] = useState('')
  const [successData, setSuccessData] = useState(null)

  const [seriesList, setSeriesList] = useState([])
  const [isSeriesModalOpen, setIsSeriesModalOpen] = useState(false)

  const [title, setTitle] = useState('')
  const [series, setSeries] = useState('DECO')
  const [seriesNumber, setSeriesNumber] = useState('')
  const [medium, setMedium] = useState('Acrílico y resina epóxica sobre madera')
  const [year, setYear] = useState(new Date().getFullYear().toString())
  const [dimensions, setDimensions] = useState('30 x 30 x 4 cm')
  const [basePrice, setBasePrice] = useState('')
  const [acceptsPrints, setAcceptsPrints] = useState(false) // 👈 Estado para Prints
  const [description, setDescription] = useState('')
  const [imageFile, setImageFile] = useState(null)
  const [imagePreview, setImagePreview] = useState(null)

  useEffect(() => {
    const initPage = async () => {
      const { data: { session } } = await supabase.auth.getSession()

      if (!session) {
        router.push('/login')
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      const { data: userRow } = await supabase
        .from('users')
        .select('role')
        .eq('id', session.user.id)
        .maybeSingle()

      const roleUpper = String(profile?.role || userRow?.role || '').toUpperCase()
      const adminEmails = String(process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
      const isAdmin =
        roleUpper === 'ADMIN' ||
        roleUpper === 'ADMINISTRADOR' ||
        adminEmails.includes(String(session.user.email || '').toLowerCase())

      if (!isAdmin) {
        router.push('/collection')
        return
      }

      const { data: seriesData } = await supabase
        .from('series')
        .select('id, title')
        .order('title', { ascending: true })

      if (seriesData && seriesData.length > 0) {
        setSeriesList(seriesData)
        setSeries(seriesData[0].title.toUpperCase())
      } else {
        const defaultSeries = [
          { id: '1', title: 'DECO' },
          { id: '2', title: 'FLOW' },
          { id: '3', title: 'ORBITALS' },
          { id: '4', title: 'ART TOYS' },
          { id: '5', title: 'EDICIÓN ESPECIAL' }
        ]
        setSeriesList(defaultSeries)
        setSeries('DECO')
      }

      setCheckingAuth(false)
    }

    initPage()
  }, [router, supabase])

  const handleSeriesCreated = (newSeries) => {
    const formattedTitle = newSeries.title.toUpperCase()
    setSeriesList((prev) =>
      [...prev, { id: newSeries.id, title: formattedTitle }].sort((a, b) =>
        a.title.localeCompare(b.title)
      )
    )
    setSeries(formattedTitle)
  }

  const handleImageChange = (e) => {
    const file = e.target.files?.[0]
    if (file) {
      setImageFile(file)
      setImagePreview(URL.createObjectURL(file))
    }
  }

  const generateClaimToken = () => {
    const chars = '23456789ABCDEFGHJKLMNPQRSTUVWXYZ'
    let result = 'JBU-'
    for (let i = 0; i < 4; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    result += '-'
    for (let i = 0; i < 2; i++) {
      result += chars.charAt(Math.floor(Math.random() * chars.length))
    }
    return result
  }

  const handleSubmit = async (e) => {
    e.preventDefault()
    setLoading(true)
    setErrorMsg('')
    setSuccessData(null)

    try {
      const formattedNumber = seriesNumber.toString().padStart(2, '0')
      const cleanSeriesPrefix = series.replace(/\s+/g, '').toUpperCase()
      const sku = `${cleanSeriesPrefix}-${formattedNumber}`.toLowerCase()

      const { data: existingSku } = await supabase
        .from('artworks')
        .select('id')
        .ilike('sku', sku)
        .maybeSingle()

      if (existingSku) {
        throw new Error(`El SKU "${sku.toUpperCase()}" ya se encuentra registrado. Elige otro número de serie.`)
      }

      let primaryImageUrl = null
      if (imageFile) {
        const fileExt = imageFile.name.split('.').pop()
        const fileName = `${sku}-${Date.now()}.${fileExt}`
        const filePath = `artwork-images/${fileName}`

        const { error: uploadError } = await supabase.storage
          .from('artworks')
          .upload(filePath, imageFile, { upsert: true })

        if (uploadError) {
          throw new Error(`Error al subir imagen: ${uploadError.message}`)
        }

        const { data: publicUrlData } = supabase.storage
          .from('artworks')
          .getPublicUrl(filePath)

        primaryImageUrl = publicUrlData.publicUrl
      }

      const claimToken = generateClaimToken()

      const newArtworkData = {
        title: title.trim(),
        sku: sku.toLowerCase(),
        series: series,
        medium: medium.trim(),
        year: parseInt(year, 10) || new Date().getFullYear(),
        dimensions: dimensions.trim(),
        base_price_mxn: basePrice ? parseFloat(basePrice) : null,
        allows_prints: acceptsPrints, // 👈 Se guarda en la DB
        description: description.trim(),
        primary_image_url: primaryImageUrl,
        claim_token: claimToken,
        ownership_status: 'AVAILABLE',
        created_at: new Date().toISOString()
      }

      const { data: insertedArt, error: insertError } = await supabase
        .from('artworks')
        .insert([newArtworkData])
        .select()
        .single()

      if (insertError) {
        throw new Error(`Error al registrar obra en Supabase: ${insertError.message}`)
      }

      setSuccessData({
        ...insertedArt,
        claim_token: claimToken
      })

      setTitle('')
      setSeriesNumber('')
      setDescription('')
      setAcceptsPrints(false)
      setImageFile(null)
      setImagePreview(null)

    } catch (err) {
      setErrorMsg(err.message || 'Ocurrió un error al guardar la obra.')
    } finally {
      setLoading(false)
    }
  }

  if (checkingAuth) {
    return (
      <div className={styles.loadingState}>
        <InlineLoading description="Verificando credenciales de administrador..." />
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <div className={styles.inner}>
        <header className={styles.header}>
          <div>
            <p className={styles.kicker}>Panel administrativo — Estudio JBU</p>
            <h1 className={styles.title}>Alta de nueva obra</h1>
          </div>
          <Button
            as={Link}
            href="/admin/artworks"
            kind="ghost"
            size="md"
            renderIcon={ArrowLeft}
          >
            Volver al inventario
          </Button>
        </header>

        {successData && (
          <section className={styles.success}>
            <div className={styles.successTop}>
              <h2 className={styles.successTitle}>Obra registrada correctamente</h2>
              <Tag type="green">SKU: {successData.sku?.toUpperCase()}</Tag>
            </div>

            <p className={styles.successText}>
              La obra <strong>&ldquo;{successData.title}&rdquo;</strong> fue agregada al catálogo.
            </p>

            <div className={styles.token}>
              <span className={styles.tokenLabel}>Código secreto de reclamación</span>
              <p className={styles.tokenValue}>{successData.claim_token}</p>
            </div>

            <div className={styles.successActions}>
              <Button
                as={Link}
                href={`/verify/${encodeURIComponent(successData.sku)}`}
                kind="primary"
                size="md"
                renderIcon={ArrowUpRight}
              >
                Ver certificado público
              </Button>
              <Button kind="tertiary" size="md" onClick={() => setSuccessData(null)}>
                Registrar otra obra
              </Button>
            </div>
          </section>
        )}

        {errorMsg && (
          <InlineNotification
            className={styles.notification}
            kind="error"
            lowContrast
            title="No se pudo guardar la obra"
            subtitle={errorMsg}
            onCloseButtonClick={() => setErrorMsg('')}
          />
        )}

        <form onSubmit={handleSubmit} className={styles.form}>
          <section className={styles.section}>
            <p className={styles.sectionLabel}>Fotografía de la obra</p>
            <div className={styles.media}>
              <div className={styles.preview}>
                {imagePreview ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={imagePreview}
                    alt="Vista previa de la obra"
                    className={styles.previewImage}
                  />
                ) : (
                  <span className={styles.previewEmpty}>Vista previa</span>
                )}
              </div>

              <FileUploader
                accept={['image/*']}
                buttonKind="tertiary"
                buttonLabel="Seleccionar imagen"
                filenameStatus="edit"
                labelDescription="Formatos JPG, PNG o WEBP. Se usará como imagen principal del catálogo."
                labelTitle="Archivo de imagen"
                onChange={handleImageChange}
                onDelete={() => {
                  setImageFile(null)
                  setImagePreview(null)
                }}
                size="md"
              />
            </div>
          </section>

          <section className={styles.section}>
            <p className={styles.sectionLabel}>Datos de la pieza</p>
            <div className={styles.fields}>
              <div className={styles.full}>
                <TextInput
                  id="title"
                  labelText="Título de la obra"
                  placeholder="Ej. Interior Signal, Orbital Node #1"
                  required
                  value={title}
                  onChange={(e) => setTitle(e.target.value)}
                />
              </div>

              <div>
                <div className={styles.seriesHead}>
                  <span className={styles.sectionLabel} style={{ margin: 0 }}>
                    Colección / serie
                  </span>
                  <Button
                    kind="ghost"
                    size="sm"
                    renderIcon={Add}
                    onClick={() => setIsSeriesModalOpen(true)}
                  >
                    Crear serie
                  </Button>
                </div>
                <Select
                  id="series"
                  labelText=""
                  hideLabel
                  value={series}
                  onChange={(e) => setSeries(e.target.value)}
                >
                  {seriesList.map((s) => (
                    <SelectItem
                      key={s.id}
                      value={s.title.toUpperCase()}
                      text={s.title.toUpperCase()}
                    />
                  ))}
                </Select>
              </div>

              <div>
                <NumberInput
                  id="seriesNumber"
                  label="Número de pieza"
                  min={1}
                  hideSteppers={false}
                  value={seriesNumber === '' ? '' : Number(seriesNumber)}
                  onChange={(e, { value }) => setSeriesNumber(value === '' ? '' : String(value))}
                />
                <p className={styles.skuHint}>
                  SKU: {series.replace(/\s+/g, '')}-
                  {seriesNumber ? seriesNumber.toString().padStart(2, '0') : 'XX'}
                </p>
              </div>

              <TextInput
                id="medium"
                labelText="Técnica / medio"
                required
                value={medium}
                onChange={(e) => setMedium(e.target.value)}
              />

              <NumberInput
                id="year"
                label="Año"
                min={1900}
                max={2200}
                value={Number(year) || new Date().getFullYear()}
                onChange={(e, { value }) => setYear(String(value ?? ''))}
              />

              <TextInput
                id="dimensions"
                labelText="Dimensiones"
                placeholder="Ej. 30 x 30 x 4 cm"
                value={dimensions}
                onChange={(e) => setDimensions(e.target.value)}
              />

              <TextInput
                id="basePrice"
                labelText="Precio base (MXN)"
                placeholder="Ej. 8500"
                type="number"
                value={basePrice}
                onChange={(e) => setBasePrice(e.target.value)}
              />

              <div className={`${styles.full} ${styles.toggleRow}`}>
                <Toggle
                  id="acceptsPrints"
                  labelText="Disponible para impresiones / prints"
                  labelA="No"
                  labelB="Sí"
                  toggled={acceptsPrints}
                  onToggle={(checked) => setAcceptsPrints(checked)}
                />
                <p className={styles.toggleHelp}>
                  Habilita opciones de compra de reproducciones en el catálogo público.
                </p>
              </div>

              <div className={styles.full}>
                <TextArea
                  id="description"
                  labelText="Descripción"
                  placeholder="Detalles sobre la pieza, concepto o acabado..."
                  rows={4}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                />
              </div>
            </div>
          </section>

          <div className={styles.submit}>
            {loading ? (
              <InlineLoading description="Guardando obra..." status="active" />
            ) : (
              <Button className={styles.submitButton} type="submit" kind="primary" size="lg">
                Registrar obra y generar código
              </Button>
            )}
          </div>
        </form>
      </div>

      <CreateSeriesModal
        isOpen={isSeriesModalOpen}
        onClose={() => setIsSeriesModalOpen(false)}
        onSeriesCreated={handleSeriesCreated}
      />
    </div>
  )
}
