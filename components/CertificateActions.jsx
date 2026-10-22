'use client'

import { useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { Button, InlineLoading } from '@carbon/react'
import { ArrowLeft, Download } from '@carbon/icons-react'
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/verify/[sku]/Verify.module.css'

// Descarga del PDF oficial persistente (nunca se reconstruye en el navegador).
export default function CertificateActions({ sku, canDownload = false }) {
  const { t } = useI18n()
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [note, setNote] = useState('')

  async function download() {
    setNote('')
    const { data } = await supabase.auth.getSession()
    const token = data?.session?.access_token
    const back = `/verify/${encodeURIComponent(sku)}`
    if (!token) { router.push(`/login?next=${encodeURIComponent(back)}&redirectTo=${encodeURIComponent(back)}`); return }
    setBusy(true)
    try {
      const res = await fetch(`/api/certificates/download?sku=${encodeURIComponent(sku)}`, { headers: { Authorization: `Bearer ${token}` } })
      const json = await res.json().catch(() => ({}))
      if (res.ok && json.url) { window.location.assign(json.url); return }
      setNote(res.status === 403
        ? t('Solo el propietario registrado puede descargar este certificado.', 'Only the registered owner can download this certificate.')
        : json.error === 'pdf_pending'
          ? t('El documento oficial se está preparando. Inténtalo más tarde.', 'The official document is being prepared. Please try again later.')
          : t('No fue posible descargar el certificado.', 'The certificate could not be downloaded.'))
    } finally { setBusy(false) }
  }

  return (
    <div className={`${styles.actions} print:hidden`}>
      <Link href="/collection" style={{ textDecoration: 'none' }}>
        <Button kind="ghost" size="sm" renderIcon={ArrowLeft}>
          {t('Mi Colección', 'My Collection')}
        </Button>
      </Link>
      {canDownload && (
        <div>
          <Button kind="primary" size="sm" renderIcon={Download} onClick={download} disabled={busy}>
            {busy ? <InlineLoading description={t('Preparando…', 'Preparing…')} /> : t('Descargar certificado', 'Download Certificate')}
          </Button>
          {note && <p className={styles.downloadNote} role="status">{note}</p>}
        </div>
      )}
    </div>
  )
}
