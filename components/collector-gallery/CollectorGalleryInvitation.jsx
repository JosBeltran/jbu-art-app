'use client'

import Link from 'next/link'
import { Button } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import { JBUEditorialLabel } from '@/components/jbu/JBUEditorial'
import { useI18n } from '@/components/I18nProvider'
import { COLLECTORS_GALLERY_PATH } from '@/lib/publicNavigation'
import styles from './CollectorGallery.module.css'

export default function CollectorGalleryInvitation() {
  const { t } = useI18n()

  return (
    <section className={styles.invitation} aria-labelledby="collector-invitation-title">
      <div className={styles.invitationInner}>
        <div>
          <JBUEditorialLabel>{t('JBU · Coleccionistas', 'JBU · Collectors')}</JBUEditorialLabel>
          <h2 id="collector-invitation-title">{t('El arte encuentra su lugar.', 'Art Finds Its Place.')}</h2>
        </div>
        <div className={styles.invitationCopy}>
          <p className={styles.supporting}>{t(
            'Cada obra comienza una nueva historia cuando llega a su destino.',
            'Every artwork begins a new story when it reaches its destination.'
          )}</p>
          <p>{t(
            'Descubre fotografías reales que nuestros clientes han compartido con nosotros, mostrando cómo las obras de JBU forman parte de sus espacios.',
            'Discover authentic photographs shared by our customers, showing how JBU artworks become part of their spaces.'
          )}</p>
          <Button as={Link} href={COLLECTORS_GALLERY_PATH} kind="tertiary" renderIcon={ArrowRight} className={styles.invitationLink}>
            {t('Explorar la galería', 'Explore the Gallery')}
          </Button>
        </div>
      </div>
    </section>
  )
}
