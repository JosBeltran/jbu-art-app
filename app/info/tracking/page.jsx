'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import Link from 'next/link'
import { useI18n } from '@/components/I18nProvider'
import { JBUSection } from '@/components/jbu/JBUEditorial'
import { InfoShell } from '../InfoPage'
import styles from '../InfoPage.module.css'

export default function TrackingPage() {
  const { t } = useI18n()
  const router = useRouter()
  const [id, setId] = useState('')

  const submit = (e) => {
    e.preventDefault()
    const value = id.trim()
    if (value) router.push(`/orders/${encodeURIComponent(value)}`)
  }

  return (
    <InfoShell
      label={['JBU · Envíos', 'JBU · Shipping']}
      title={['Rastrea tu pedido', 'Track your order']}
      intro={['Escribe tu número de pedido para ver su estado y la guía de envío.', 'Enter your order number to see its status and tracking details.']}
    >
      <JBUSection id="rastreo" label={t('Pedido', 'Order')} title={t('Número de pedido', 'Order number')}>
        <form className={styles.form} onSubmit={submit}>
          <label htmlFor="order-id" className="cds--visually-hidden">{t('Número de pedido', 'Order number')}</label>
          <input id="order-id" className={styles.input} value={id} onChange={(e) => setId(e.target.value)} placeholder={t('Ej. número de pedido', 'e.g. order number')} required />
          <button type="submit" className={styles.submit}>{t('Rastrear', 'Track')}</button>
        </form>
        <p className={styles.hint} style={{ marginTop: '1.5rem' }}>
          {t('Si tienes cuenta, también puedes ver todos tus pedidos en ', 'If you have an account, you can also see all your orders in ')}
          <Link href="/collection" style={{ color: 'var(--jbu-purple)' }}>{t('tu colección', 'your collection')}</Link>.
        </p>
      </JBUSection>
    </InfoShell>
  )
}
