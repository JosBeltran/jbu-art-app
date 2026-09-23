'use client'

import Link from 'next/link'
import { Button } from '@carbon/react'
import { ArrowLeft } from '@carbon/icons-react'
import DownloadPdfButton from '@/components/DownloadPdfButton'
import { useI18n } from '@/components/I18nProvider'

export default function CertificateActions({ sku }) {
  const { t } = useI18n()
  return (
    <div className="w-full max-w-2xl flex justify-between items-center mb-6 print:hidden">
      <Link href="/collection" style={{ textDecoration: 'none' }}>
        <Button
          kind="ghost"
          size="sm"
          renderIcon={ArrowLeft}
        >
          {t('Mi Colección', 'My Collection')}
        </Button>
      </Link>

      <div className="print:hidden">
        <DownloadPdfButton elementId="classic-certificate" sku={sku} />
      </div>
    </div>
  )
}
