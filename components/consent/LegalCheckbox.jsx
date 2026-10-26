'use client'
import Link from 'next/link'
import { Checkbox } from '@carbon/react'
import styles from './Consent.module.css'
import { useI18n } from '@/components/I18nProvider'
export default function LegalCheckbox({ accepted, onChange, beforeContinue = false }) {
  const { t } = useI18n()
  return <div className={styles.acceptance}><Checkbox id="legal-acceptance" checked={accepted} onChange={(_, { checked }) => onChange(checked)} hideLabel labelText={t('Aceptar Términos y Condiciones y Aviso de Privacidad', 'Accept Terms and Conditions and Privacy Notice')} aria-describedby="legal-acceptance-text" /><p id="legal-acceptance-text" className={styles.note}>{beforeContinue ? t('He leído y acepto los ', 'I have read and accept the ') : t('Al crear una cuenta, acepto los ', 'By creating an account, I accept the ')}<Link href="/terms" target="_blank" rel="noopener noreferrer">{t('Términos y Condiciones', 'Terms and Conditions')}</Link>{t(' y el ', ' and the ')}<Link href="/privacy" target="_blank" rel="noopener noreferrer">{t('Aviso de Privacidad', 'Privacy Notice')}</Link>.</p></div>
}
