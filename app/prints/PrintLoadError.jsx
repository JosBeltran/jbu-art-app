'use client'

import { useTransition } from 'react'
import { useRouter } from 'next/navigation'
import { Button } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/catalog/Catalog.module.css'

export default function PrintLoadError({ partial = false } = {}) {
  const router = useRouter()
  const [retrying,startRetry] = useTransition()
  const { t } = useI18n()
  return <div className={styles.empty} aria-busy={retrying}>
    <p role="status">{retrying
      ? t('Cargando prints…','Loading prints…')
      : partial
        ? t('Algunas opciones de print no se pudieron cargar.','Some print options could not be loaded.')
        : t('No pudimos cargar los prints en este momento.','We could not load the prints right now.')}</p>
    <Button kind="tertiary" size="sm" disabled={retrying} onClick={()=>startRetry(()=>router.refresh())}>
      {t('Reintentar','Retry')}
    </Button>
  </div>
}
