'use client'

import Link from 'next/link'
import { Button } from '@carbon/react'
import { ArrowLeft } from '@carbon/icons-react'
import DownloadPdfButton from '@/components/DownloadPdfButton'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/verify/[sku]/Verify.module.css'

export default function CertificateActions({ sku }) {
  const { t } = useI18n()
  return (
    <div className={`${styles.actions} print:hidden`}>
      <Link href="/collection" style={{ textDecoration: 'none' }}>
        <Button kind="ghost" size="sm" renderIcon={ArrowLeft}>
          {t('Mi Colección', 'My Collection')}
        </Button>
      </Link>
      <DownloadPdfButton elementId="classic-certificate" sku={sku} />
    </div>
  )
}
