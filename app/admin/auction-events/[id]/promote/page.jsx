'use client'

import { useParams } from 'next/navigation'
import PromotionStudio from '@/components/promo/PromotionStudio'

export default function PromoteEventPage() {
  const { id } = useParams()
  return <PromotionStudio eventId={id} />
}
