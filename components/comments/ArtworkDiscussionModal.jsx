'use client'

import ArtworkLightbox from '@/components/ArtworkLightbox'
import ArtworkDiscussion, { contextLabel } from './ArtworkDiscussion'
import { useI18n } from '@/components/I18nProvider'
import { discussionKey } from '@/lib/artworkDiscussion'
import styles from './Discussion.module.css'

export function DiscussionPanel({ artworkId, user, context, title, label, photo = "" }) {
  const { t } = useI18n()
  return <section className={styles.panel} aria-label={t('Comentarios', 'Discussion')}>
    <header className={styles.context}>
      <h2>{title}</h2>
      <p>{[context.kind === 'print' ? t('Discusión de la variante', 'Variant discussion') : contextLabel(context.kind, t), label].filter(Boolean).join(' · ')}</p>
    </header>
    <ArtworkDiscussion key={artworkId + ':' + discussionKey(context) + ':' + (user?.id || 'guest')}
      artworkId={artworkId} context={context} user={user} photo={photo} />
  </section>
}

export default function ArtworkDiscussionModal({ artworkId, user, context, title, image, label, onClose }) {
  const { t } = useI18n()
  if (!context) return null
  return <ArtworkLightbox isOpen onClose={onClose} artworkTitle={title}
    discussionOnly images={image ? [{ url: image, alt: title }] : []}
    discussionPanel={<DiscussionPanel artworkId={artworkId} context={context} title={title} label={label} user={user} />}
    discussionLabel={t('Comentarios sobre', 'Discussion on')} />
}
