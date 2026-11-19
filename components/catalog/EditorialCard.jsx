import Link from 'next/link'
import { ArrowUpRight } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import styles from '@/app/catalog/Catalog.module.css'

/** @param {{href: string, image?: string | null, sku?: string, title: string, status?: string | null,
 * context?: string | null, price?: string | null, secondary?: import('react').ReactNode, heading?: 'h2' | 'h3'}} props */
export default function EditorialCard({ href, image, sku, title, status = null, context = null, price = null, secondary = null, heading = 'h2' }) {
  const Heading = heading
  return <article className={styles.card}>
    <Link href={href} className={styles.cardLink}>
      <div className={styles.imageLink}>
        <ArtworkImage key={image || sku} title={title} primaryUrl={image} sku={sku} className={styles.image}
          sizes="(max-width: 600px) 94vw, (max-width: 1055px) 46vw, 30vw" />
      </div>
      <div className={styles.caption}>
        <Heading className={styles.cardTitle}>{title}</Heading>
        {status && <span className={styles.cardStatus}>{status}</span>}
        <ArrowUpRight size={16} aria-hidden="true" />
      </div>
    </Link>
    {(context || price || secondary) && <div className={styles.cardContext}>
      {context && <p>{context}</p>}
      {price && <p className={styles.cardPrice}>{price}</p>}
      {secondary}
    </div>}
  </article>
}
