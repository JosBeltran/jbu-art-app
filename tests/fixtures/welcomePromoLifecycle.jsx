// Browser-only fixture. Router, artwork loading and promo responses are isolated;
// the runner bundles the actual WelcomePromoModal source and its CSS unchanged.
import { StrictMode, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import WelcomePromoModal from '../../components/promo/WelcomePromoModal'

const listeners = new Set()
const add = window.addEventListener.bind(window)
const remove = window.removeEventListener.bind(window)
window.addEventListener = (type, listener, ...rest) => {
  if (type === 'keydown') listeners.add(listener)
  return add(type, listener, ...rest)
}
window.removeEventListener = (type, listener, ...rest) => {
  if (type === 'keydown') listeners.delete(listener)
  return remove(type, listener, ...rest)
}

const fixture = window.promoFixture = {
  response: { status: 'INVALID_EMAIL' }, submissions: [], promoReads: 0,
  imageReads: 0, errors: [], keyListeners: () => listeners.size,
  responseReady: null, imageReady: null,
}
window.fetch = async (url, options) => {
  if (url !== '/api/promo') throw new Error('Unexpected fixture request: ' + url)
  if (options?.method === 'POST') {
    fixture.submissions.push(JSON.parse(options.body))
    await new Promise(resolve => { fixture.responseReady = resolve })
    if (fixture.response === 'NETWORK_ERROR') throw new Error('Fixture network failure')
    return { json: async () => fixture.response }
  }
  fixture.promoReads++
  return { json: async () => ({ active: window.fixtureEligible !== false, percentOff: 10 }) }
}
add('error', event => fixture.errors.push(event.message))

function App() {
  const [session, setSession] = useState(window.fixtureSession || null)
  const [mounted, setMounted] = useState(true)
  useLayoutEffect(() => {
    fixture.session = setSession
    fixture.unmount = () => setMounted(false)
    fixture.ready = true
  }, [])
  return <>
    <button id="before">Background before</button>
    <button id="after">Background after</button>
    <div style={{ height: '2000px' }}>Local promotion lifecycle fixture</div>
    {mounted && <WelcomePromoModal session={session} />}
  </>
}

createRoot(document.getElementById('root')).render(<StrictMode><App /></StrictMode>)
