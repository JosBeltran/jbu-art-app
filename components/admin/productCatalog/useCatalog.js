'use client'

import { useCallback, useEffect, useState, useRef } from 'react'
import { authHeaders } from '@/lib/authHeaders'

export async function callCatalog(operation, input = {}, { signal } = {}) {
  const timeout = AbortSignal.timeout(operation === 'wallArtCosts' ? 40000 : 25000)
  const request = await fetch('/api/admin/product-catalog', {
    method: 'POST', signal: signal ? AbortSignal.any([signal,timeout]) : timeout,
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
    catch (err) { if(err.name !== 'AbortError') setError(err.message) }
    finally { locked.current = false; setBusy(false) }
  }
  return { busy, error, run }
}

// Read-only discovery/cost requests have independent lifetimes. Never use this
// cancellation scope for create/save/publish mutations, whose outcome may commit.
export function useCatalogReads() {
  const requests=useRef(new Map())
  const cancel=useCallback(()=>{
    for(const controller of requests.current.values())controller.abort()
    requests.current.clear()
  },[])
  useEffect(()=>cancel,[cancel])
  const begin=useCallback(key=>{
    requests.current.get(key)?.abort()
    const controller=new AbortController()
    requests.current.set(key,controller)
    return {signal:controller.signal,current:()=>requests.current.get(key)===controller && !controller.signal.aborted}
  },[])
  return {begin,cancel}
}
