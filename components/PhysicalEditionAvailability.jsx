'use client'

import { Tag } from '@carbon/react'
import { useI18n } from '@/components/I18nProvider'
import { editionAvailability, editionAvailabilityLabel } from '@/lib/physicalEdition'

export default function PhysicalEditionAvailability({ counts, size, compact = false, loading = false }) {
  const { t } = useI18n()
  const state = editionAvailability(counts)
  const total = counts?.edition_size || size
  const label = loading ? t('Consultando inventario…', 'Checking inventory…') : editionAvailabilityLabel(state, t)
  const remaining = state !== 'configuration' ? counts.available : null
  return (
    <div aria-live="polite">
      {compact ? <span>{label}</span> : <Tag type={{ available: 'green', limited: 'purple', reserved: 'warm-gray' }[state] || 'gray'}>{label}</Tag>}
      {!compact && total > 0 && <p>{t(`Tiraje total: ${total}`, `Total edition size: ${total}`)}</p>}
      {remaining !== null && <p>{t(`${remaining} ejemplares disponibles`, `${remaining} units available`)}</p>}
    </div>
  )
}
