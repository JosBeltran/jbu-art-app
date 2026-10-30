'use client'

import { useCurrency } from '@/components/CurrencyProvider'
import { useI18n } from '@/components/I18nProvider'

/** Botón compacto MXN / USD con el mismo estilo que LanguageToggle. */
/** @param {{ className?: string, style?: import('react').CSSProperties }} props */
export default function CurrencyToggle({ className = '', style = {} } = {}) {
  const { currency, setCurrency } = useCurrency()
  const { t } = useI18n()
  const next = currency === 'MXN' ? 'USD' : 'MXN'
  return (
    <button
      type="button"
      onClick={() => setCurrency(next)}
      className={className}
      aria-label={t(`Mostrar precios en ${next}`, `Show prices in ${next}`)}
      title={next}
      style={{ background: 'transparent', border: 0, cursor: 'pointer', font: 'inherit', color: 'inherit', letterSpacing: '0.12em', padding: '0 0.5rem', minHeight: '2rem', ...style }}
    >
      <span style={{ opacity: currency === 'MXN' ? 1 : 0.45, fontWeight: currency === 'MXN' ? 600 : 400 }}>MXN</span>
      <span style={{ opacity: 0.35, margin: '0 0.25rem' }}>/</span>
      <span style={{ opacity: currency === 'USD' ? 1 : 0.45, fontWeight: currency === 'USD' ? 600 : 400 }}>USD</span>
    </button>
  )
}
