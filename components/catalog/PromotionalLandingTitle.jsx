'use client'
import { useI18n } from '@/components/I18nProvider'
import { getLocalizedSeriesContent } from '@/lib/seriesContent'

export default function PromotionalLandingTitle({ series = null }) {
  const { t, lang } = useI18n()
  const title = series ? getLocalizedSeriesContent(series, lang).name : t('Impresiones artísticas', 'Fine Art Prints')
  return <h1 style={{ maxWidth: 'none', margin: 0, color: 'var(--cds-text-primary)', fontSize: 'clamp(2.5rem, 5vw, 5rem)', fontWeight: 300, lineHeight: 1.05 }}>{title}</h1>
}
