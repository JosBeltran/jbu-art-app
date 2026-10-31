'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Button,
  InlineLoading,
  InlineNotification,
  ContentSwitcher,
  Switch,
  TextArea,
  Toggle,
} from '@carbon/react'
import { Save } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import SocialSharingSettings from '@/components/admin/SocialSharingSettings'
import AdminDeliverySettings from '@/components/delivery/AdminDeliverySettings'
import HeroStudio from '@/components/admin/HeroStudio'
import SeriesHomeList from '@/components/admin/SeriesHomeList'
import { AnnouncementBannerView } from '@/components/AnnouncementBanner'
import styles from '../artworks/[id]/edit/EditArtwork.module.css'

/**
 * Admin > Home: una sola pantalla para la configuración de la portada.
 *
 * Reúne, sin duplicar lógica, lo que antes vivía en «Hero de portada»
 * (HeroStudio) y «Series y portada» (SeriesHomeList), más el Announcement
 * Banner, que se guarda en la fila única de `site_settings`.
 */
export default function AdminHomePage() {
  const { t } = useI18n()
  const [bannerLoading, setBannerLoading] = useState(true)
  const [bannerReady, setBannerReady] = useState(true)
  const [bannerEnabled, setBannerEnabled] = useState(false)
  const [textEs, setTextEs] = useState('')
  const [textEn, setTextEn] = useState('')
  const [savingBanner, setSavingBanner] = useState(false)
  const [previewLang, setPreviewLang] = useState('es')
  const [notice, setNotice] = useState(null)

  useEffect(() => {
    let active = true
    supabase
      .from('site_settings')
      .select('announcement_enabled, announcement_text_es, announcement_text_en')
      .eq('id', true)
      .maybeSingle()
      .then(({ data, error }) => {
        if (!active) return
        if (error) {
          setBannerReady(false)
        } else if (data) {
          setBannerEnabled(data.announcement_enabled === true)
          setTextEs(data.announcement_text_es || '')
          setTextEn(data.announcement_text_en || '')
        }
        setBannerLoading(false)
      })
    return () => { active = false }
  }, [])

  const saveBanner = async () => {
    setSavingBanner(true)
    const { error } = await supabase
      .from('site_settings')
      .upsert({
        id: true,
        announcement_enabled: bannerEnabled,
        announcement_text_es: textEs.trim(),
        announcement_text_en: textEn.trim(),
        updated_at: new Date().toISOString(),
      })
    setSavingBanner(false)
    setNotice(error
      ? { kind: 'error', text: `${t('No se pudo guardar el banner', 'Could not save the banner')}: ${error.message}` }
      : { kind: 'success', text: t('Banner guardado.', 'Banner saved.') })
  }

  return (
    <div style={{ maxWidth: 960, display: 'grid', gap: '1.5rem' }}>
      <header>
        <p style={{ fontSize: '.75rem', letterSpacing: '.12em', textTransform: 'uppercase', color: 'var(--jbu-purple)' }}>{t('Administración', 'Admin')}</p>
        <h1 style={{ fontSize: '1.75rem', fontWeight: 400, margin: '.25rem 0 .5rem' }}>{t('Portada', 'Home')}</h1>
        <p style={{ color: 'var(--cds-text-secondary)', maxWidth: '62ch' }}>
          {t(
            'Toda la configuración de la página principal en un solo lugar: el banner informativo superior, el Hero y las series que aparecen en la portada.',
            'All home page configuration in one place: the top announcement banner, the Hero and the series shown on the home page.'
          )}
        </p>
      </header>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Banner de anuncio', 'Announcement Banner')}</h2>
            <p className={styles.sectionHelp}>
              {t(
                'Mensaje breve en la parte superior del sitio público. Se muestra en el idioma activo del visitante; al desactivarlo no deja espacio vacío.',
                'A short message at the top of the public site. It follows the visitor’s active language; when disabled it leaves no empty space.'
              )}
            </p>
          </div>
        </div>
        {bannerLoading ? (
          <InlineLoading description={t('Cargando banner…', 'Loading banner…')} />
        ) : !bannerReady ? (
          <InlineNotification
            kind="warning"
            lowContrast
            hideCloseButton
            title={t('Banner de anuncio', 'Announcement Banner')}
            subtitle={t(
              'Aplica la migración 20261107_announcement_banner.sql en Supabase para configurar el banner.',
              'Apply migration 20261107_announcement_banner.sql in Supabase to configure the banner.'
            )}
          />
        ) : (
          <div style={{ display: 'grid', gap: '1rem' }}>
            {notice && (
              <InlineNotification
                kind={notice.kind}
                lowContrast
                title={t('Banner de anuncio', 'Announcement Banner')}
                subtitle={notice.text}
                onCloseButtonClick={() => setNotice(null)}
              />
            )}
            <Toggle
              id="announcement-enabled"
              labelText={t('Mostrar el banner en el sitio público', 'Show the banner on the public site')}
              labelA={t('Oculto', 'Hidden')}
              labelB={t('Visible', 'Visible')}
              toggled={bannerEnabled}
              onToggle={setBannerEnabled}
            />
            <TextArea
              id="announcement-es"
              labelText={t('HTML en español', 'Spanish HTML')}
              helperText={t(
                'Texto plano o HTML limitado: strong, b, em, i, u, span, a, br, p, div con class, style, href y target. Scripts, eventos y enlaces javascript: se eliminan.',
                'Plain text or limited HTML: strong, b, em, i, u, span, a, br, p, div with class, style, href and target. Scripts, events and javascript: links are removed.'
              )}
              rows={4}
              value={textEs}
              onChange={(e) => setTextEs(e.target.value)}
              placeholder="<strong>ENVÍO GRATIS</strong> nacional e internacional"
              style={{ fontFamily: 'var(--cds-code-01-font-family, monospace)' }}
            />
            <TextArea
              id="announcement-en"
              labelText={t('HTML en inglés', 'English HTML')}
              rows={4}
              value={textEn}
              onChange={(e) => setTextEn(e.target.value)}
              placeholder="<strong>FREE SHIPPING</strong> within Mexico and internationally"
              style={{ fontFamily: 'var(--cds-code-01-font-family, monospace)' }}
            />
            <div style={{ display: 'grid', gap: '0.5rem' }}>
              <h3 className={styles.sectionHelp} style={{ margin: 0 }}>
                {t('Vista previa del banner', 'Banner preview')}
              </h3>
              <ContentSwitcher
                size="sm"
                selectedIndex={previewLang === 'en' ? 1 : 0}
                onChange={({ name }) => setPreviewLang(name)}
                style={{ maxWidth: '12rem' }}
              >
                <Switch name="es" text="ES" />
                <Switch name="en" text="EN" />
              </ContentSwitcher>
              {!bannerEnabled && (
                <p className={styles.sectionHelp} style={{ margin: 0 }}>
                  {t('El banner está oculto: el sitio público no lo mostrará.', 'The banner is hidden: the public site will not show it.')}
                </p>
              )}
              <div style={{ border: '1px dashed var(--cds-border-subtle)' }}>
                {(() => {
                  // Mismo respaldo de idioma que el sitio público (inglés vacío usa español).
                  const html = previewLang === 'en' ? (textEn.trim() || textEs.trim()) : (textEs.trim() || textEn.trim())
                  return html
                    ? <AnnouncementBannerView html={html} as="presentation" />
                    : <p className={styles.sectionHelp} style={{ margin: 0, padding: '0.5rem 1rem' }}>{t('Sin contenido.', 'No content.')}</p>
                })()}
              </div>
            </div>
            <div>
              <Button renderIcon={Save} disabled={savingBanner} onClick={saveBanner}>
                {savingBanner ? t('Guardando…', 'Saving…') : t('Guardar banner', 'Save banner')}
              </Button>
            </div>
          </div>
        )}
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Hero de portada', 'Home Hero')}</h2>
            <p className={styles.sectionHelp}>
              {t(
                'La misma configuración de siempre del Hero, ahora dentro de esta pantalla.',
                'The same Hero configuration as before, now inside this screen.'
              )}
            </p>
          </div>
        </div>
        <HeroStudio />
      </section>

      <section className={styles.section}>
        <div className={styles.sectionHead}>
          <div>
            <h2 className={styles.sectionTitle}>{t('Series en la portada', 'Series on Home')}</h2>
            <p className={styles.sectionHelp}>
              {t(
                'Ordena las series y decide cuáles aparecen en la portada. La edición completa de cada serie sigue en su propia pantalla.',
                'Order the series and choose which appear on the home page. Full editing of each series stays on its own screen.'
              )}
            </p>
          </div>
        </div>
        <SeriesHomeList />
      </section>
      <SocialSharingSettings />
      <AdminDeliverySettings />
    </div>
  )
}
