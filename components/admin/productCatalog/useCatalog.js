'use client'

import { useState, useRef } from 'react'
import { authHeaders } from '@/lib/authHeaders'

export async function callCatalog(operation, input = {}) {
  const request = await fetch('/api/admin/product-catalog', {
    method: 'POST', signal: AbortSignal.timeout(25000),
    headers: { ...await authHeaders(), 'Content-Type': 'application/json' },
    body: JSON.stringify({ operation, input }),
  })
  const result = await request.json()
  if (!request.ok) throw new Error([result.error, ...(result.fields || [])].join(' · '))
  return result
}

export function useCatalog() {
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState('')
  const locked = useRef(false)
  async function run(work) {
    if (locked.current) return
    locked.current = true
    setBusy(true)
    setError('')
    try { await work() }
    catch (err) { setError(err.message) }
    finally { locked.current = false; setBusy(false) }
  }
  return { busy, error, run }
}
