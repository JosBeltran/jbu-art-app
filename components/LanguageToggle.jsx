'use client'

import { useI18n } from '@/components/I18nProvider'

/** Botón compacto ES / EN. Acepta className para adaptarse a cada cabecera. */
/** @param {{ className?: string, style?: import('react').CSSProperties }} props */
export default function LanguageToggle({ className = undefined, style = undefined } = {}) {
  const { lang, toggleLang, t } = useI18n()
  return (
    <button
      type="button"
      onClick={toggleLang}
      className={className}
      aria-label={t('Cambiar idioma a inglés', 'Switch language to Spanish')}
      title={t('English', 'Español')}
      style={{
        background: 'transparent',
        border: 0,
        cursor: 'pointer',
        font: 'inherit',
        color: 'inherit',
        letterSpacing: '0.12em',
        padding: '0 0.5rem',
        minHeight: '2rem',
        ...style,
      }}
    >
      <span style={{ opacity: lang === 'es' ? 1 : 0.45, fontWeight: lang === 'es' ? 600 : 400 }}>ES</span>
      <span style={{ opacity: 0.35, margin: '0 0.25rem' }}>/</span>
      <span style={{ opacity: lang === 'en' ? 1 : 0.45, fontWeight: lang === 'en' ? 600 : 400 }}>EN</span>
    </button>
  )
}
