// Actual overlay components; commerce/auth/network boundaries are isolated.
import { StrictMode, useLayoutEffect, useState } from 'react'
import { createRoot } from 'react-dom/client'
import { Header, HeaderGlobalBar, Theme } from '@carbon/react'
import { AppThemeProvider, useAppTheme } from '../../components/AppThemeProvider'
import ShippingProvider, { shippingCheckoutFetch } from '../../components/shipping/ShippingProvider'
import MarketProvider from '../../components/market/MarketProvider'
import MarketSelector from '../../components/market/MarketSelector'
import CartDrawer from '../../components/CartDrawer'
import CreateSeriesModal from '../../components/CreateSeriesModal'
import ArtworkLightbox from '../../components/ArtworkLightbox'
import ArtworkVideoReveal from '../../components/media/ArtworkVideoReveal'
import CatalogClient from '../../app/catalog/CatalogClient'

const fixture = window.overlayFixture = { requests: [], created: [], backgroundClicks: 0, errors: [], doneCount: 0 }
window.fetch = async (url, options = {}) => {
  if (url.startsWith('/api/local-delivery?')) return {ok:true,json:async()=>({config:{enabled:true,paymentOnDeliveryEnabled:true,timezone:'America/Monterrey',standardLeadHours:24},capabilities:{paymentOnDelivery:true}})}
  if (url === '/api/shipping') return { ok: true, json: async () => ({ globalCountries: ['MX', 'US', 'CA'], policies: [], defaults: {} }) }
  if (url === '/fixture-checkout') {
    const body = JSON.parse(options.body)
    fixture.requests.push(body)
    return body.destination ? { status: 200, json: async () => ({ accepted: body }) } : {
      status: 409, clone() { return this }, json: async () => ({ error: 'shipping_destination_required', countries: ['CA', 'US'] }),
    }
  }
  throw new Error('Unexpected fixture network: ' + url)
}
window.addEventListener('error', event => fixture.errors.push(event.message))
function Shell() {
  const { dark, toggleTheme } = useAppTheme()
  const [view, setView] = useState(null)
  const [mounted, setMounted] = useState(true)
  const [index, setIndex] = useState(0)
  useLayoutEffect(() => {
    fixture.open = setView
    fixture.unmount = () => setMounted(false)
    fixture.toggleTheme = toggleTheme
    fixture.ready = true
  }, [toggleTheme])
  const close = () => setView(null)
  return <Theme theme={dark ? 'g100' : 'g10'}>
    <div style={{ position: 'fixed', inset: '0 0 auto', zIndex: 50 }}><Header aria-label="JBU" style={{ zIndex: 8000 }}><HeaderGlobalBar><MarketSelector /></HeaderGlobalBar></Header></div>
    <main style={{ paddingTop: 64 }}>
      <button id="background" onClick={() => fixture.backgroundClicks++}>Background action</button>
      <button id="shipping-trigger" onClick={async () => {
        fixture.checkout = await (await shippingCheckoutFetch('/fixture-checkout', { method: 'POST', body: JSON.stringify({ requestKey: 'unchanged', currency: 'MXN' }) })).json()
      }}>Shipping prompt</button>
      {['cart', 'series', 'lightbox', 'reveal', 'catalog'].map(name => <button id={`${name}-trigger`} key={name} onClick={() => setView(name)}>{name}</button>)}
      <div id="artwork" style={{ position: 'relative', zIndex: 60, height: 1600, background: 'repeating-linear-gradient(45deg,#8a3ffc 0 60px,#f1c21b 60px 120px)' }}>Artwork behind dialogs</div>
      {mounted && <>
        <CartDrawer isOpen={view === 'cart'} onClose={close} />
        <CreateSeriesModal isOpen={view === 'series'} onClose={close} onSeriesCreated={row => fixture.created.push(row)} />
        <ArtworkLightbox isOpen={view === 'lightbox'} onClose={close} artworkTitle="Fixture artwork" images={['/art.svg', '/art-2.svg']} currentIndex={index} onSelectIndex={setIndex} />
        {view === 'reveal' && <ArtworkVideoReveal waiting={window.fixtureRevealWaiting !== false} title="Fixture artwork" onDone={() => { fixture.doneCount++; close() }} />}
        {view === 'catalog' && <CatalogClient initialArtworks={[]} />}
      </>}
    </main>
  </Theme>
}
function App() {
  return <AppThemeProvider initialDark={window.fixtureDark}><ShippingProvider><MarketProvider initialCountry={window.fixtureOriginal ? 'MX' : null}><Shell /></MarketProvider></ShippingProvider></AppThemeProvider>
}
const root = createRoot(document.getElementById('root'))
fixture.dispose = () => root.unmount()
root.render(<StrictMode><App /></StrictMode>)
