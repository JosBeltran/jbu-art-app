'use client'

import { useEffect, useMemo, useState } from 'react'
import { Button, InlineLoading, InlineNotification, Select, SelectItem, TextInput, TextArea } from '@carbon/react'
import { Save, Launch } from '@carbon/icons-react'
import ImageUploader from '@/app/admin/artworks/components/ImageUploader'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { normalizePromoSettings, PROMOTIONAL_DEFAULTS, seriesSlug } from '@/lib/social/promotional'
import { getLocalizedSeriesContent } from '@/lib/seriesContent'
import styles from './PromotionalSocialEditor.module.css'

const SITE = 'https://www.josuebeltranuresti.com'

/** Reusable per-public-page OG manager within the existing social_sharing JSON. */
export default function PromotionalSocialEditor({ kind, series = null, mainImage = '' }) {
  const { t } = useI18n()
  const id = series?.id ? String(series.id) : null
  const slug = series ? seriesSlug(series) : ''
  const path = kind === 'series' ? '/series/' + encodeURIComponent(slug) : '/' + kind
  const url = SITE + path
  const [form, setForm] = useState(null)
  const [saving, setSaving] = useState(false)
  const [notice, setNotice] = useState(null)
  const [locale, setLocale] = useState('es')
  const [failed, setFailed] = useState(false)
  const [dimensions, setDimensions] = useState(null)
  const defaults = PROMOTIONAL_DEFAULTS[kind] || PROMOTIONAL_DEFAULTS.catalog

  useEffect(() => {
    let active = true
    setForm(null); setFailed(false)
    supabase.from('site_settings').select('social_sharing').eq('id', true).maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) setFailed(true)
        const key = kind === 'series' ? 'promotionalSeries' : 'promotionalPages'
        const stored = data?.social_sharing?.[key]?.[id || kind] || {}
        const normalized = normalizePromoSettings(stored)
        setForm(normalized)
        setLocale(normalized.default_language)
      }, () => { if (active) { setFailed(true); setForm(normalizePromoSettings({})) } })
    return () => { active = false }
  }, [kind, id])

  const set = (field, value) => setForm(prev => ({ ...prev, [field]: value }))
  const fallback = useMemo(() => series ? getLocalizedSeriesContent(series, locale) : null, [series, locale])
  const alternative = locale === 'en' ? 'es' : 'en'
  const title = form?.['title_' + locale] || form?.['title_' + alternative] || fallback?.name || defaults['title_' + locale]
  const description = form?.['description_' + locale] || form?.['description_' + alternative] || fallback?.shortDescription || fallback?.description || defaults['description_' + locale]
  const image = form?.image_url || mainImage || SITE + '/opengraph-image.jpg'

  const save = async () => {
    setSaving(true); setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      const token = data?.session?.access_token
      if (!token) throw new Error('unauthorized')
      const response = await fetch('/api/admin/promotional-social', {
        method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: 'Bearer ' + token },
        body: JSON.stringify({ kind, seriesId: id, settings: form }),
      })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'settings_save_failed')
      setForm(result.settings)
      setNotice({ kind: 'success', text: t('Vista previa guardada.', 'Sharing preview saved.') })
    } catch (error) {
      setNotice({ kind: 'error', text: String(error.message || error) })
    } finally { setSaving(false) }
  }

  return <section className={styles.section} aria-label={t('Vista previa para compartir', 'Social sharing preview')}>
    <h2>{t('Social Sharing Settings', 'Social Sharing Settings')} · {kind === 'series' ? (series?.title || 'Series') : kind === 'prints' ? 'Fine Art Prints' : 'Catalog'}</h2>
    <p className={styles.helper}>{t('Configura el título, la descripción y una imagen exclusiva para el enlace público. Esta imagen no reemplaza al Hero.', 'Set the title, description, and dedicated image for the public link. This does not replace the visible Hero.')}</p>
    <p className={styles.path}>{url}</p>
    {!form ? <InlineLoading description={t('Cargando…', 'Loading…')} /> : <div className={styles.form}>
      {failed && <InlineNotification kind="error" lowContrast hideCloseButton title={t('No pudimos leer la configuración. No guardes hasta verificar la conexión.', 'Could not load settings. Do not save until connectivity is restored.')} />}
      {notice && <InlineNotification lowContrast kind={notice.kind} title={t('Compartir', 'Sharing')} subtitle={notice.text} onCloseButtonClick={() => setNotice(null)} />}
      <Select id={'og-language-' + (id || kind)} labelText={t('Idioma predeterminado al compartir', 'Default sharing language')}
        value={form.default_language} onChange={e => { set('default_language', e.target.value); setLocale(e.target.value) }}>
        <SelectItem value="es" text="Español" /><SelectItem value="en" text="English" />
      </Select>
      <div className={styles.fields}>
        <TextInput id={'og-title-es-' + (id || kind)} labelText="OG title · ES" value={form.title_es}
          placeholder={series?.name_es || series?.title || defaults.title_es} maxLength={180} onChange={e => set('title_es', e.target.value)} />
        <TextInput id={'og-title-en-' + (id || kind)} labelText="OG title · EN" value={form.title_en}
          placeholder={series?.name_en || series?.name_es || defaults.title_en} maxLength={180} onChange={e => set('title_en', e.target.value)} />
        <TextArea id={'og-desc-es-' + (id || kind)} labelText="OG description · ES" value={form.description_es}
          placeholder={series?.short_description_es || defaults.description_es} maxLength={400} rows={3} onChange={e => set('description_es', e.target.value)} />
        <TextArea id={'og-desc-en-' + (id || kind)} labelText="OG description · EN" value={form.description_en}
          placeholder={series?.short_description_en || series?.short_description_es || defaults.description_en} maxLength={400} rows={3} onChange={e => set('description_en', e.target.value)} />
      </div>
      <div className={styles.imageControls}>
        <p className={styles.helper}>{t('Imagen OG exclusiva · recomendado 1200 × 630 px (1.91:1). JPG, PNG o WebP en almacenamiento público.', 'Dedicated OG image · recommended 1200 × 630 px (1.91:1). JPG, PNG or WebP in public storage.')}</p>
        <ImageUploader key={'og-image-' + (id || kind) + (form.image_url || '')} currentUrl={form.image_url} pathPrefix={'social-sharing/' + (id || kind)}
          onUploadComplete={value => set('image_url', value)} />
        <TextInput id={'og-img-url-' + (id || kind)} labelText="OG image · HTTPS URL" value={form.image_url}
          onChange={e => set('image_url', e.target.value)} />
        <TextInput id={'og-img-alt-' + (id || kind)} labelText={t('Texto alternativo de la imagen', 'Image alt text')}
          value={form.image_alt} maxLength={240} onChange={e => set('image_alt', e.target.value)} />
      </div>
      <div className={styles.previewRegion}>
        <h3>{t('Vista previa aproximada de Facebook', 'Approximate Facebook link preview')}</h3>
        <div className={styles.langButtons}>
          <Button kind={locale === 'es' ? 'secondary' : 'ghost'} size="sm" onClick={() => setLocale('es')}>ES</Button>
          <Button kind={locale === 'en' ? 'secondary' : 'ghost'} size="sm" onClick={() => setLocale('en')}>EN</Button>
        </div>
        <div className={styles.preview}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={image} alt={form.image_alt || title} className={styles.previewImage}
            onLoad={e => setDimensions({ width: e.currentTarget.naturalWidth, height: e.currentTarget.naturalHeight })}
            onError={() => setDimensions(null)} />
          <div className={styles.previewCopy}>
            <span>JOSUEBELTRANURESTI.COM</span>
            <strong>{title}</strong>
            <p>{description}</p>
          </div>
        </div>
        {dimensions && Math.abs(dimensions.width / dimensions.height - 1200 / 630) > .07 && (
          <p className={styles.warning}>{t(
            `La imagen es ${dimensions.width} × ${dimensions.height} px y su proporción no es 1.91:1. Facebook podría recortarla; considera exportarla a 1200 × 630 px.`,
            `The image is ${dimensions.width} × ${dimensions.height} px, not a 1.91:1 ratio. Facebook may crop it; consider exporting at 1200 × 630 px.`
          )}</p>
        )}
        <p className={styles.helper}>{t('Es una aproximación; Meta decide cómo recortar y mostrar la tarjeta final. Una imagen horizontal 1200 × 630 evita recortes impredecibles.', 'This is an approximation; Meta controls the final crop and appearance. A 1200 × 630 landscape image avoids unpredictable cropping.')}</p>
      </div>
      <div className={styles.actions}>
        <Button renderIcon={Save} onClick={save} disabled={saving || failed}>{saving ? t('Guardando…', 'Saving…') : t('Guardar vista previa', 'Save sharing preview')}</Button>
        <Button kind="tertiary" renderIcon={Launch} onClick={() => window.open('https://developers.facebook.com/tools/debug/?q=' + encodeURIComponent(url), '_blank', 'noopener,noreferrer')}>
          {t('Probar vista previa en Facebook', 'Test Facebook Preview')}
        </Button>
      </div>
    </div>}
  </section>
}
