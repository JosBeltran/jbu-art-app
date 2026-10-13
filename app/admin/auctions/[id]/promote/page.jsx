'use client'

import { useParams } from 'next/navigation'
import PromotionStudio from '@/components/promo/PromotionStudio'

export default function PromoteLotPage() {
  const { id } = useParams()
  return <PromotionStudio auctionId={id} />
}
