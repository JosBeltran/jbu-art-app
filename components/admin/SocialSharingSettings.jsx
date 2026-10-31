'use client'
import { useEffect, useState } from 'react'
import { Button, TextInput, Toggle, Select, SelectItem, InlineLoading, InlineNotification } from '@carbon/react'
import { Save } from '@carbon/icons-react'
import ImageUploader from '@/app/admin/artworks/components/ImageUploader'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { socialConfig, SOCIAL_DEFAULTS } from '@/lib/social/config'
import styles from './SocialSharingSettings.module.css'

export default function SocialSharingSettings() {
  const { t } = useI18n()
  const [config, setConfig] = useState(null)
  const [notice, setNotice] = useState(null)
  const [busy, setBusy] = useState(false)
  const [missing, setMissing] = useState(false)
  const [loadError, setLoadError] = useState(false)
  const [attempt, setAttempt] = useState(0)
  useEffect(() => {
    let active = true
    supabase.from('site_settings').select('social_sharing').eq('id', true).maybeSingle().then(({ data, error }) => {
      if (!active) return
      setLoadError(false); setMissing(false)
      if (error) {
        if (['42703','PGRST204'].includes(error.code)) setMissing(true)
        else setLoadError(true)
      }
      setConfig(socialConfig(data?.social_sharing))
    }, () => { if (active) { setLoadError(true); setConfig(socialConfig()) } })
    return () => { active = false }
  }, [attempt])
  const set = (key, value) => setConfig(current => ({ ...current, [key]: value }))
  const setFlag = (format, key, value) => setConfig(current => ({ ...current, [format]: { ...current[format], [key]: value } }))
  const save = async () => {
    setBusy(true); setNotice(null)
    try {
      const { data } = await supabase.auth.getSession()
      if (!data?.session?.access_token) throw new Error('unauthorized')
      const response = await fetch('/api/admin/social-sharing', { method: 'PUT', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${data.session.access_token}` }, body: JSON.stringify({ config }) })
      const result = await response.json()
      if (!response.ok) throw new Error(result.error || 'settings_save_failed')
      setConfig(result.config); setNotice({ kind: 'success', text: t('Configuración guardada.', 'Settings saved.') })
    } catch (error) { setNotice({ kind: 'error', text: `${t('No se pudo guardar', 'Could not save')}: ${error.message}` }) }
    finally { setBusy(false) }
  }
  const labels = { branding: t('Activar branding', 'Enable branding'), logo: t('Mostrar logo', 'Show logo'), title: t('Mostrar título', 'Show title'), artist: t('Mostrar artista', 'Show artist'), domain: t('Mostrar dominio', 'Show domain') }
  return <section className={styles.section}>
    <h2 className={styles.heading}>{t('Compartir en redes', 'Social sharing')}</h2>
    {!config ? <InlineLoading description={t('Cargando…', 'Loading…')} /> : missing ? <InlineNotification kind="warning" lowContrast hideCloseButton title={t('Configuración no disponible', 'Settings unavailable')} subtitle={t('Aplica la migración 20261112_social_sharing.sql para habilitar esta sección.', 'Apply migration 20261112_social_sharing.sql to enable this section.')} /> : <div className={styles.form}>
      {loadError && <><InlineNotification kind="warning" lowContrast hideCloseButton title={t('No se pudo cargar la configuración', 'Could not load settings')} subtitle={t('Inténtalo de nuevo antes de guardar.', 'Try again before saving.')} /><Button kind="ghost" onClick={() => setAttempt(value => value + 1)}>{t('Reintentar', 'Retry')}</Button></>}
      {notice && <InlineNotification lowContrast kind={notice.kind} title={t('Compartir en redes', 'Social sharing')} subtitle={notice.text} onCloseButtonClick={() => setNotice(null)} />}
      <TextInput id="social-display-name" labelText={t('Nombre mostrado / artista', 'Display name / artist')} value={config.displayName} placeholder={t('Usar perfil de artista existente', 'Use existing artist profile')} maxLength={120} onChange={event => set('displayName', event.target.value)} />
      <ImageUploader key={config.logoUrl} currentUrl={config.logoUrl} pathPrefix="social-branding" onUploadComplete={url => set('logoUrl', url)} />
      <Button kind="ghost" size="sm" onClick={() => set('logoUrl', SOCIAL_DEFAULTS.logoUrl)}>{t('Usar logo del sitio', 'Use site logo')}</Button>
      <Toggle id="social-domain" labelText={t('Permitir mostrar dominio', 'Allow domain display')} toggled={config.showDomain} onToggle={value => set('showDomain', value)} labelA={t('No', 'No')} labelB={t('Sí', 'Yes')} />
      <Select id="social-theme" labelText={t('Fondo', 'Background')} value={config.theme} onChange={event => set('theme', event.target.value)}><SelectItem value="light" text={t('Claro', 'Light')} /><SelectItem value="dark" text={t('Oscuro', 'Dark')} /></Select>
      {['horizontal', 'pinterest', 'instagram'].map(format => <fieldset key={format} className={styles.group}><legend>{format === 'horizontal' ? t('Preview horizontal · 1200 × 630', 'Horizontal preview · 1200 × 630') : format === 'pinterest' ? 'Pinterest · 1000 × 1500' : 'Instagram · 1080 × 1350'}</legend>
        {format !== 'horizontal' && <Toggle id={`social-${format}-enabled`} labelText={t('Imagen optimizada y opción en menú', 'Optimized image and menu option')} toggled={config[format].enabled} onToggle={value => setFlag(format, 'enabled', value)} labelA={t('No', 'No')} labelB={t('Sí', 'Yes')} />}
        {(format === 'horizontal' ? ['branding','logo','title','artist','domain'] : ['logo','title','artist']).map(key => <Toggle key={key} id={`social-${format}-${key}`} labelText={labels[key]} toggled={config[format][key]} onToggle={value => setFlag(format,key,value)} labelA={t('No', 'No')} labelB={t('Sí', 'Yes')} />)}
      </fieldset>)}
      <div><Button renderIcon={Save} disabled={busy || loadError} onClick={save}>{busy ? t('Guardando…', 'Saving…') : t('Guardar configuración', 'Save settings')}</Button></div>
    </div>}
  </section>
}
