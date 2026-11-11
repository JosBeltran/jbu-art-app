'use client'

import { useState } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { selectedCountry } from '@/lib/countryAvailability'
import Link from 'next/link'
import { Button, Search, Select, SelectItem, Tag } from '@carbon/react'
import { ArrowRight } from '@carbon/icons-react'
import ArtworkImage from '@/components/ArtworkImage'
import { useCurrency } from '@/components/CurrencyProvider'
import { useI18n } from '@/components/I18nProvider'
import styles from '@/app/catalog/Catalog.module.css'

export default function PrintCollection({ options, countries = [] }) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const country = selectedCountry(searchParams.get('country'))
  const { t, locale } = useI18n()
  const { price } = useCurrency()
  const [query, setQuery] = useState('')
  const [size, setSize] = useState('')
  const countryNames = new Intl.DisplayNames([locale?.startsWith('en') ? 'en' : 'es'], { type: 'region' })
  function changeCountry(next) {
    const params = new URLSearchParams(searchParams.toString())
    if (!next) params.delete('country')
    else params.set('country', next)
    router.push(pathname + (params.size ? '?' + params.toString() : ''), { scroll: false })
  }
  const sizes = [...new Set(options.map(row => row.size).filter(Boolean))].sort()
  const phrase = query.trim().toLocaleLowerCase(locale)
  const visible = options.filter(row => (!size || row.size === size) &&
    [row.title, row.titleEn, row.artworkTitle, row.artworkTitleEn, row.size].filter(Boolean)
      .join(' ').toLocaleLowerCase(locale).includes(phrase))
  return <>
    <div className="mb-8 grid gap-4 sm:grid-cols-3">
      <Search id="print-collection-search" labelText={t('Buscar prints', 'Search prints')}
        placeholder={t('Buscar por título o tamaño', 'Search by title or size')} value={query} onChange={event => setQuery(event.target.value)} />
      <Select id="print-collection-country" labelText={t('País de entrega', 'Delivery country')} value={country || ''} onChange={event => changeCountry(event.target.value)}>
        <SelectItem value="" text={t('Todos los países', 'All Countries')} />
        {countries.map(code => <SelectItem key={code} value={code} text={countryNames.of(code) || code} />)}
      </Select>
      <Select id="print-collection-size" labelText={t('Tamaño', 'Size')} value={size} onChange={event => setSize(event.target.value)}>
        <SelectItem value="" text={t('Todos los tamaños', 'All sizes')} />
        {sizes.map(item => <SelectItem key={item} value={item} text={item} />)}
      </Select>
    </div>
    {!visible.length && <p>{t('No hay prints disponibles para esta selección.', 'No prints are available for this selection.')}</p>}
    <div className={styles.grid}>
      {visible.map(row => {
        const title = t(row.title, row.titleEn)
        const parent = t(row.artworkTitle, row.artworkTitleEn)
        return <article key={row.id} className={styles.card}>
          <Link className={styles.imageLink} href={row.href.replace('#prints', (country ? '&country=' + country : '') + '#prints')} aria-label={title + ' · ' + row.size}>
            <ArtworkImage title={title} primaryUrl={row.image} sku={row.artworkSku} className={styles.image} />
          </Link>
          <div className={styles.cardBody}>
            <div className={styles.cardOverline}>
              <span>{row.size}</span>
              <Tag size="sm" type="purple">{row.edition === 'OPEN' ? t('Edición abierta', 'Open Edition') : t('Edición limitada', 'Limited Edition')}</Tag>
            </div>
            <h2 className={styles.cardTitle}>{title}</h2>
            {parent !== title && <p className={styles.details}>{parent}</p>}
            {row.dimensionsMm && <p className={styles.details}>{row.dimensionsMm.join(' × ')} mm</p>}
            {row.paper && <p className={styles.details}>{row.paper}</p>}
            {row.madeToOrder && <p className={styles.details}>{t('Impresión bajo pedido. La imagen muestra la composición y los márgenes.', 'Printed to order. The image shows the composition and borders.')}</p>}
            <p className={styles.cardPrice}>{price(row.price).text} · {t('Disponible', 'Available')}</p>
            <Button className="mt-3" as={Link} href={row.href} kind="tertiary" size="sm" renderIcon={ArrowRight}>
              {t('Ver print', 'View print')}
            </Button>
          </div>
        </article>
      })}
    </div>
  </>
}
