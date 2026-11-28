import { useId, useState } from 'react'
import { ChevronDown, ChevronUp } from '@carbon/icons-react'
import { Button } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { catalogMoney } from '@/lib/productCatalog/commerce'
import styles from './WallSpace.module.css'

export default function CompositionSummary({ items, total, country, currency }) {
  const { t, locale } = useI18n()
  const [expanded,setExpanded]=useState(false)
  const breakdownId=useId()
  const ready = items.filter(item => item.price).length
  const pending = items.filter(item => item.pending).length
  const market = [country, currency].filter(Boolean).join(' · ')
  const totalLabel = ready ? catalogMoney(total, currency, locale) : '—'
  return <aside className={styles.compositionSummary} aria-label={t('Resumen de la selección','Selection summary')}>
    <div aria-live="polite">
      <strong>{t('Piezas','Pieces')} {items.length} · {totalLabel}</strong>
      {market && <small>{market}</small>}
      <small>{t('Listas para compra','Ready to buy')} {ready} · {t('En solicitud','Requested')} {pending}</small>
    </div>
    {items.length>0 && <Button className={styles.breakdownButton} kind="ghost" size="sm"
      renderIcon={expanded ? ChevronUp : ChevronDown} aria-expanded={expanded} aria-controls={breakdownId}
      onClick={()=>setExpanded(value=>!value)}>
      {expanded ? t('Ocultar desglose','Hide breakdown') : t('Ver desglose','View breakdown')}
    </Button>}
    <ul className={styles.breakdown} id={breakdownId} hidden={!expanded}>
      {items.map(({ id, title, pending, price })=><li key={id}>
        {title} · {price ? catalogMoney(price.amountMinor,price.currency,locale)
          : pending ? t('En solicitud','Requested') : t('Solo visualización','Preview only')}
      </li>)}
    </ul>
  </aside>
}
