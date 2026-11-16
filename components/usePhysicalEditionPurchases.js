'use client'
import { useCallback, useEffect, useRef, useState } from 'react'
import { authHeaders } from '@/lib/authHeaders'

export default function usePhysicalEditionPurchases(userId, artworkId = null) {
  const [snapshot, setSnapshot] = useState({ owner: null, purchases: [], busy: false, failed: false, checked: false })
  const generation = useRef(0)
  const owner = `${userId || ''}:${artworkId || ''}`
  const refresh = useCallback(async (cancelArtwork = null) => {
    if (!userId) return []
    const version = ++generation.current
    setSnapshot(old => ({ ...(old.owner === owner ? old : { purchases: [], checked: false }), owner, busy: true, failed: false }))
    try {
      const load = async (cancelId) => {
        const response = await fetch(`/api/checkout/physical-edition/status${artworkId ? `?artworkId=${encodeURIComponent(artworkId)}` : ''}`, {
          method: cancelId ? 'POST' : 'GET',
          headers: { ...(await authHeaders()), ...(cancelId ? { 'Content-Type': 'application/json' } : {}) },
          ...(cancelId ? { body: JSON.stringify({ artworkId: cancelId }) } : {}),
          cache: 'no-store',
        })
        const data = await response.json()
        if (!response.ok) throw new Error('edition_status_unavailable')
        return data
      }
      let data = await load(cancelArtwork)
      // A cancellation returns one artwork; reload the account list afterwards.
      if (cancelArtwork && !artworkId) data = await load(null)
      if (version !== generation.current) return []
      setSnapshot({ owner, purchases: data.purchases || [], busy: false, failed: false, checked: true })
      if (cancelArtwork || data.purchases?.some(p => p.canStartNew)) window.dispatchEvent(new Event('jbu:edition-inventory-changed'))
      return data.purchases || []
    } catch {
      if (version === generation.current) setSnapshot(old => ({ ...old, owner, busy: false, failed: true, checked: true }))
      return null
    }
  }, [userId, artworkId, owner])

  useEffect(() => {
    if (!userId) return
    // Initial loading synchronizes this view with the authenticated server state.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    void refresh()
    const check = () => { void refresh() }
    window.addEventListener('focus', check)
    window.addEventListener('pageshow', check)
    return () => {
      // This is an async request sequence counter, not a DOM ref.
      // eslint-disable-next-line react-hooks/exhaustive-deps
      generation.current++
      window.removeEventListener('focus', check)
      window.removeEventListener('pageshow', check)
    }
  }, [userId, refresh])
  const current = snapshot.owner === owner ? snapshot : { purchases: [], busy: Boolean(userId), failed: false, checked: !userId }
  return { ...current, refresh }
}
