'use client'
import { Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/(account)/collection/Collection.module.css'
export default function CollectionRegistry({ data }) {
  const { t, locale } = useI18n()
  if (!data) return null
  return <div className={styles.orders}>
    <section><h2>{t('Certificados', 'Certificates')} ({data.certificates.length})</h2>
      {data.certificates.map(c => <p key={c.id}>{c.sku} · {c.certificate_number} <Tag type={c.status === 'ISSUED' ? 'green' : 'gray'}>{c.status}</Tag> · {c.pdf_hash ? t('PDF disponible', 'PDF available') : t('PDF pendiente', 'PDF pending')}</p>)}
    </section>
    <section><h2>{t('Reclamaciones pendientes', 'Pending claims')} ({data.pendingClaims.length})</h2>
      {data.pendingClaims.map(a => <p key={a.id}>{a.sku} · {a.title} <Tag type="warm-gray">{a.ownership_status}</Tag></p>)}
    </section>
    <section><h2>{t('Grupos de reclamación', 'Claim groups')} ({data.groups.length})</h2>
      {data.groups.map(g => <div key={g.id}><p>{g.buyer_name} · {new Date(g.created_at).toLocaleDateString(locale)}</p>{g.items.map(i => <p key={i.id}>{data.artworks.find(a => a.id === i.artwork_id)?.sku || t('Obra del pedido', 'Order artwork')} · {i.is_claimed ? t('Reclamada', 'Claimed') : t('Pendiente', 'Pending')}</p>)}</div>)}
    </section>
    <section><h2>{t('Proveniencia', 'Provenance')} ({data.provenance.length})</h2>
      {data.provenance.map(e => <div key={e.id}><p>{data.artworks.find(a => a.id === e.artwork_id)?.sku} · {e.title || e.event_type} · {e.event_date || new Date(e.created_at).toLocaleDateString(locale)}</p>{e.description && <p>{e.description}</p>}</div>)}
    </section>
  </div>
}
