'use client'

import { useEffect, useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import {
  Button,
  InlineLoading,
  InlineNotification,
  TextInput,
  Toggle,
} from '@carbon/react'
import { Save } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'
import HeroStudio from '@/components/admin/HeroStudio'
import SeriesHomeList from '@/components/admin/SeriesHomeList'
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
            <TextInput
              id="announcement-es"
              labelText={t('Texto en español', 'Spanish text')}
              value={textEs}
              onChange={(e) => setTextEs(e.target.value)}
              placeholder="Envío nacional e internacional incluido"
            />
            <TextInput
              id="announcement-en"
              labelText={t('Texto en inglés', 'English text')}
              value={textEn}
              onChange={(e) => setTextEn(e.target.value)}
              placeholder="National and international shipping included"
            />
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
    </div>
  )
}
