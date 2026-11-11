'use client'

import { Button } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'

export default function PrintNotFound() {
  const { t } = useI18n()
  return <section style={{ maxWidth: '42rem', margin: '3rem auto', padding: '0 1rem' }}>
    <h1>{t('Impresión no disponible', 'Print unavailable')}</h1>
    <p style={{ margin: '1rem 0' }}>{t('Esta variante ya no está publicada o el enlace no es válido.', 'This variant is no longer published or the link is invalid.')}</p>
    <Button href="/prints">{t('Ver impresiones', 'Browse prints')}</Button>
  </section>
}
