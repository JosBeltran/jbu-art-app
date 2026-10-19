'use client'

import { useEffect, useMemo, useState } from 'react'
import { useParams } from 'next/navigation'
import Link from 'next/link'
import { Button, Checkbox, ContentSwitcher, Switch, InlineLoading, InlineNotification, Select, SelectItem, Tag, TextArea, TextInput, Toggle } from '@carbon/react'
import { ArrowLeft, Rocket, Save, CheckmarkFilled, Bullhorn } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { belongsToSeries, isAvailableArtwork } from '@/lib/homeSeries'
import { hasSeriesName } from '@/lib/seriesContent'
import OptimizedImg from '@/components/media/OptimizedImg'
import ImageUploader from '../../artworks/components/ImageUploader'
import VideoUploader from '../../artworks/components/VideoUploader'
import SeriesReleaseStudio from '@/components/promo/SeriesReleaseStudio'

const TEXT_FIELDS = ['name_es', 'name_en', 'subtitle_es', 'subtitle_en', 'short_description_es', 'short_description_en', 'description_es', 'description_en']
const FIELDS = ['home_featured', 'home_order', 'editorial_status', 'main_artwork_id', 'launch_date', 'auto_launch', 'show_countdown', 'teaser_image_url', 'teaser_video_url', 'cta_label', 'cta_url']

const toLocalInput = (iso) => {
  if (!iso) return ''
  const d = new Date(iso)
  return new Date(d.getTime() - d.getTimezoneOffset() * 60000).toISOString().slice(0, 16)
}

export default function SeriesEditorPage() {
  const { id } = useParams()
  const { t } = useI18n()
  const [series, setSeries] = useState(null)
  const [form, setForm] = useState({})
  const [works, setWorks] = useState([])
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')
  const [notice, setNotice] = useState('')
  const [hasBilingual, setHasBilingual] = useState(false)
  const [editLang, setEditLang] = useState('es')
  const [promoOpen, setPromoOpen] = useState(false)

  useEffect(() => {
    const load = async () => {
      setLoading(true)
      const { data: s, error } = await supabase.from('series').select('*').eq('id', id).single()
      if (error || !s) { setError(error?.message || t('Serie no encontrada', 'Series not found')); setLoading(false); return }
      setSeries(s)
      setHasBilingual('name_es' in s)
      setForm({
        home_featured: Boolean(s.home_featured), home_order: s.home_order ?? 0, editorial_status: s.editorial_status || 'active',
        main_artwork_id: s.main_artwork_id || '', launch_date: toLocalInput(s.launch_date), auto_launch: Boolean(s.auto_launch), show_countdown: Boolean(s.show_countdown),
        // Español: si aún no existe *_es, se muestra el texto actual (legado) para no perderlo.
        name_es: s.name_es || s.home_headline || s.title || '', name_en: s.name_en || '',
        subtitle_es: s.subtitle_es || s.home_subtitle || '', subtitle_en: s.subtitle_en || '',
        short_description_es: s.short_description_es || s.home_description || '', short_description_en: s.short_description_en || '',
        description_es: s.description_es || s.description || '', description_en: s.description_en || '',
        teaser_image_url: s.teaser_image_url || '', teaser_video_url: s.teaser_video_url || '', cta_label: s.cta_label || '', cta_label_en: s.cta_label_en || '', cta_url: s.cta_url || '',
      })
      if (!('editorial_status' in s)) setError(t('Falta activar la portada por series: corre la migración 20261013_series_editorial.sql en Supabase.', 'Series home is not enabled yet: run migration 20261013_series_editorial.sql in Supabase.'))
      const { data: arts } = await supabase.from('artworks').select('id, sku, title, series, series_id, status, ownership_status, featured, primary_image_url').order('created_at', { ascending: false })
      setWorks((arts || []).filter((a) => belongsToSeries(a, s)))
      setLoading(false)
    }
    load()
  }, [id])

  const set = (key, value) => setForm((prev) => ({ ...prev, [key]: value }))
  const featuredCount = useMemo(() => works.filter((w) => w.featured && w.id !== form.main_artwork_id).length, [works, form.main_artwork_id])

  const save = async (overrides = {}) => {
    setSaving(true); setError(''); setNotice('')
    const payload = {}
    const next = { ...form, ...overrides }
    for (const k of FIELDS) payload[k] = next[k] === '' ? null : next[k]
    if (hasBilingual) {
      if (!hasSeriesName(next)) { setError(t('Escribe el nombre de la serie al menos en un idioma.', 'Enter the series name in at least one language.')); setSaving(false); return }
      for (const k of TEXT_FIELDS) payload[k] = String(next[k] || '').trim() || null
    }
    if (series && 'cta_label_en' in series) payload.cta_label_en = String(next.cta_label_en || '').trim() || null
    payload.home_order = Number(next.home_order) || 0
    payload.launch_date = next.launch_date ? new Date(next.launch_date).toISOString() : null
    if (payload.main_artwork_id && !works.some((w) => w.id === payload.main_artwork_id)) {
      setError(t('La obra principal debe pertenecer a esta serie.', 'The main artwork must belong to this series.')); setSaving(false); return
    }
    const { error } = await supabase.from('series').update(payload).eq('id', id)
    setSaving(false)
    if (error) { setError(error.message); return }
    setForm(next)
    setNotice(t('Serie guardada. La portada ya muestra los cambios.', 'Series saved. The home page already shows the changes.'))
  }

  if (loading) return <InlineLoading description={t('Cargando…', 'Loading…')} />
  if (!series) return <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} />

  const section = { display: 'grid', gap: '1rem', padding: '1.5rem 0', borderTop: '1px solid var(--cds-border-subtle)' }
  const h2 = { fontSize: '1rem', fontWeight: 500, margin: 0 }
  const help = { margin: 0, fontSize: '.875rem', color: 'var(--cds-text-secondary)' }
  const isSoon = form.editorial_status === 'coming_soon'

  return (
    <div style={{ maxWidth: 1040, display: 'grid', gap: '1rem' }}>
      <Link href="/admin/series" style={{ display: 'inline-flex', gap: '.5rem', alignItems: 'center', color: 'var(--jbu-purple)', fontSize: '.875rem' }}><ArrowLeft size={16} /> {t('Series', 'Series')}</Link>
      <header>
        <p style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--jbu-purple)' }}>{t('Portada / Editorial', 'Home / Editorial')}</p>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: '.25rem 0' }}>{series.title}</h1>
        <Button kind="tertiary" size="md" renderIcon={Bullhorn} onClick={() => setPromoOpen(true)} style={{ marginTop: '.5rem' }}>{t('PROMOVER SERIE', 'PROMOTE SERIES')}</Button>
      </header>
      {promoOpen && <SeriesReleaseStudio open={promoOpen} onClose={() => setPromoOpen(false)} series={{ ...series, ...form }} works={works} mainArtworkId={form.main_artwork_id} />}
      {error && <InlineNotification kind="error" lowContrast title={t('Error', 'Error')} subtitle={error} onCloseButtonClick={() => setError('')} />}
      {notice && <InlineNotification kind="success" lowContrast title={notice} onCloseButtonClick={() => setNotice('')} />}
      {form.home_featured && form.editorial_status === 'active' && !form.main_artwork_id && (
        <InlineNotification kind="warning" lowContrast hideCloseButton title={t('Sin obra principal', 'No main artwork')} subtitle={t('Mientras tanto, la portada usará la primera obra destacada de la serie.', 'Meanwhile the home page will use the first featured artwork of the series.')} />
      )}
      {form.home_featured && form.editorial_status === 'active' && featuredCount === 0 && (
        <InlineNotification kind="info" lowContrast hideCloseButton title={t('Sin obras destacadas', 'No featured artworks')} subtitle={t('Se mostrará solo la obra principal con más espacio. Marca obras como "Destacada dentro de su serie" para acompañarla.', 'Only the main artwork will be shown, with more space. Mark artworks as "Featured within series" to add more.')} />
      )}

      <section style={section}>
        <h2 style={h2}>{t('Estado y portada', 'Status and home')}</h2>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <Select id="editorial_status" labelText={t('Estado editorial', 'Editorial status')} value={form.editorial_status} onChange={(e) => set('editorial_status', e.target.value)}>
            <SelectItem value="active" text={t('Activa', 'Active')} />
            <SelectItem value="coming_soon" text={t('Próximamente', 'Coming soon')} />
            <SelectItem value="outlet" text={t('Selección especial (outlet)', 'Special selection (outlet)')} />
            <SelectItem value="archived" text={t('Archivada', 'Archived')} />
          </Select>
          <TextInput id="home_order" type="number" labelText={t('Orden en portada', 'Home order')} value={String(form.home_order)} onChange={(e) => set('home_order', e.target.value)} />
          <Toggle id="home_featured" labelText={t('Mostrar en portada', 'Show on home')} labelA={t('No', 'No')} labelB={t('Sí', 'Yes')} toggled={form.home_featured} onToggle={(v) => set('home_featured', v)} />
        </div>
        {form.editorial_status === 'outlet' && <p style={help}>{t('Sus obras disponibles se muestran en la sección "Selección especial" de la portada; no incluye vendidas.', 'Its available artworks appear in the home "Special selection" section; sold works are excluded.')}</p>}
      </section>

      <section style={section}>
        <h2 style={h2}>{t('Lanzamiento', 'Launch')}</h2>
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))', alignItems: 'end' }}>
          <TextInput id="launch_date" type="datetime-local" labelText={t('Fecha de lanzamiento', 'Launch date')} value={form.launch_date} onChange={(e) => set('launch_date', e.target.value)} />
          <Checkbox id="auto_launch" labelText={t('Lanzar automáticamente en la fecha', 'Launch automatically on date')} checked={form.auto_launch} onChange={(_, { checked }) => set('auto_launch', checked)} />
          <Checkbox id="show_countdown" labelText={t('Mostrar cuenta regresiva', 'Show countdown')} checked={form.show_countdown} onChange={(_, { checked }) => set('show_countdown', checked)} />
        </div>
        {isSoon && (
          <div><Button kind="secondary" renderIcon={Rocket} disabled={saving} onClick={() => save({ editorial_status: 'active' })}>{t('Lanzar ahora', 'Launch now')}</Button></div>
        )}
      </section>

      <section style={section}>
        <h2 style={h2}>{t('Textos de portada', 'Home copy')}</h2>
        {!hasBilingual ? (
          <InlineNotification kind="warning" lowContrast hideCloseButton title={t('Textos bilingües pendientes', 'Bilingual copy pending')} subtitle={t('Corre la migración 20261023_series_bilingual_content.sql en Supabase para editar los textos en español e inglés.', 'Run migration 20261023_series_bilingual_content.sql in Supabase to edit Spanish and English copy.')} />
        ) : (
          <>
            <ContentSwitcher size="md" selectedIndex={editLang === 'en' ? 1 : 0} onChange={({ name }) => setEditLang(name)} style={{ maxWidth: 240 }}>
              <Switch name="es" text="ES" />
              <Switch name="en" text="EN" />
            </ContentSwitcher>
            {editLang === 'es' ? (
              <div key="es" style={{ display: 'grid', gap: '1rem' }}>
                <TextInput id="name_es" labelText="Nombre" placeholder={series.title} value={form.name_es} onChange={(e) => set('name_es', e.target.value)} />
                <TextInput id="subtitle_es" labelText="Subtítulo" value={form.subtitle_es} onChange={(e) => set('subtitle_es', e.target.value)} />
                <TextArea id="short_description_es" labelText="Descripción corta" rows={3} value={form.short_description_es} onChange={(e) => set('short_description_es', e.target.value)} />
                <TextArea id="description_es" labelText="Descripción" rows={5} value={form.description_es} onChange={(e) => set('description_es', e.target.value)} />
              </div>
            ) : (
              <div key="en" style={{ display: 'grid', gap: '1rem' }}>
                <p style={help}>{t('Opcional. Si un campo queda vacío, en inglés se muestra el texto en español.', 'Optional. Empty fields show the Spanish text in English.')}</p>
                <TextInput id="name_en" labelText="Name" placeholder={form.name_es || series.title} value={form.name_en} onChange={(e) => set('name_en', e.target.value)} />
                <TextInput id="subtitle_en" labelText="Subtitle" placeholder={form.subtitle_es} value={form.subtitle_en} onChange={(e) => set('subtitle_en', e.target.value)} />
                <TextArea id="short_description_en" labelText="Short description" rows={3} placeholder={form.short_description_es} value={form.short_description_en} onChange={(e) => set('short_description_en', e.target.value)} />
                <TextArea id="description_en" labelText="Description" rows={5} placeholder={form.description_es} value={form.description_en} onChange={(e) => set('description_en', e.target.value)} />
              </div>
            )}
          </>
        )}
        <div style={{ display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fit, minmax(220px, 1fr))' }}>
          <TextInput id="cta_label" labelText={t('Texto del botón (ES)', 'CTA label (ES)')} placeholder={isSoon ? t('Muy pronto', 'Explore soon') : t('Ver serie', 'View series')} value={form.cta_label} onChange={(e) => set('cta_label', e.target.value)} />
          {'cta_label_en' in series && <TextInput id="cta_label_en" labelText={t('Texto del botón (EN)', 'CTA label (EN)')} placeholder={form.cta_label || (isSoon ? 'Explore soon' : 'View series')} value={form.cta_label_en} onChange={(e) => set('cta_label_en', e.target.value)} />}
          <TextInput id="cta_url" labelText={t('Enlace del botón (opcional)', 'CTA URL (optional)')} placeholder={`/catalog?series=${encodeURIComponent(series.title)}`} value={form.cta_url} onChange={(e) => set('cta_url', e.target.value)} />
        </div>
      </section>

      <section style={section}>
        <h2 style={h2}>{t('Adelanto (Próximamente)', 'Teaser (Coming soon)')}</h2>
        <p style={help}>{t('Opcional. Si no agregas imagen ni video, la sección se muestra solo con tipografía y espacio.', 'Optional. Without image or video, the section uses typography and space only.')}</p>
        <div style={{ display: 'grid', gap: '1.5rem', gridTemplateColumns: 'repeat(auto-fit, minmax(260px, 1fr))' }}>
          <div style={{ display: 'grid', gap: '.5rem' }}>
            <ImageUploader currentUrl={form.teaser_image_url} onUploadComplete={(url) => set("teaser_image_url", url)} />
            <TextInput id="teaser_image_url" labelText={t('Imagen de adelanto (URL)', 'Teaser image (URL)')} value={form.teaser_image_url} onChange={(e) => set('teaser_image_url', e.target.value)} />
          </div>
          <div style={{ display: 'grid', gap: '.5rem' }}>
            <VideoUploader id="teaser-video" currentUrl={form.teaser_video_url} onChange={(url) => set("teaser_video_url", url)} />
            <TextInput id="teaser_video_url" labelText={t('Video de adelanto (URL)', 'Teaser video (URL)')} value={form.teaser_video_url} onChange={(e) => set('teaser_video_url', e.target.value)} />
          </div>
        </div>
      </section>

      <section style={section}>
        <h2 style={h2}>{t('Obra principal', 'Main artwork')}</h2>
        <p style={help}>{t('Toca una obra de esta serie para hacerla principal. Las marcadas como DESTACADA aparecen a su lado en la portada.', 'Tap an artwork of this series to make it main. Those marked FEATURED appear next to it on the home page.')}</p>
        {works.length === 0 ? <p style={help}>{t('Esta serie todavía no tiene obras.', 'This series has no artworks yet.')}</p> : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0, display: 'grid', gap: '1rem', gridTemplateColumns: 'repeat(auto-fill, minmax(150px, 1fr))' }}>
            {works.map((w) => {
              const isMain = w.id === form.main_artwork_id
              const sold = !isAvailableArtwork(w)
              return (
                <li key={w.id}>
                  <button type="button" aria-pressed={isMain} onClick={() => set('main_artwork_id', isMain ? '' : w.id)}
                    style={{ display: 'grid', gap: '.5rem', width: '100%', padding: '.5rem', textAlign: 'left', background: 'var(--cds-layer)', color: 'inherit', cursor: 'pointer', border: isMain ? '2px solid var(--jbu-purple)' : '1px solid var(--cds-border-subtle)' }}>
                    <span style={{ position: 'relative', display: 'block', aspectRatio: '4 / 5', overflow: 'hidden', background: 'var(--jbu-lavender)' }}>
                      {w.primary_image_url && <OptimizedImg src={w.primary_image_url} alt={w.title} variant="thumbnail" sizes="160px" style={{ width: '100%', height: '100%', objectFit: 'cover' }} />}
                      {isMain && <CheckmarkFilled size={20} style={{ position: 'absolute', top: 6, right: 6, fill: 'var(--jbu-purple)' }} />}
                    </span>
                    <span style={{ fontSize: '.8125rem', fontWeight: 500 }}>{w.title}</span>
                    <span style={{ display: 'flex', flexWrap: 'wrap', gap: '.25rem' }}>
                      {isMain && <Tag size="sm" type="purple">{t('PRINCIPAL', 'MAIN')}</Tag>}
                      {w.featured && <Tag size="sm" type="cool-gray">{t('DESTACADA', 'FEATURED')}</Tag>}
                      <Tag size="sm" type={sold ? 'gray' : 'green'}>{sold ? t('VENDIDA', 'SOLD') : t('DISPONIBLE', 'AVAILABLE')}</Tag>
                    </span>
                  </button>
                </li>
              )
            })}
          </ul>
        )}
      </section>

      <div style={{ position: 'sticky', bottom: 0, padding: '1rem 0', background: 'var(--cds-background)', borderTop: '1px solid var(--cds-border-subtle)' }}>
        <Button renderIcon={Save} disabled={saving} onClick={() => save()}>{saving ? t('Guardando…', 'Saving…') : t('Guardar serie', 'Save series')}</Button>
      </div>
    </div>
  )
}
