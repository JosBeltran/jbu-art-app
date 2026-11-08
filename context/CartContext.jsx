// context/CartContext.jsx
'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { useCurrency } from '@/components/CurrencyProvider'
import { authHeaders } from '@/lib/authHeaders'
import { cartKey, GUEST_CART_KEY, normalizeGuestCart } from '@/lib/guestPrintCart'
import { printCartBucket, limitedPrintStorageKey } from '@/lib/printCartRouting.mjs'

const PENDING_KEY = 'jbu_pending_action'

/** Guarda la acción que el visitante quería hacer antes de iniciar sesión. */
export function savePendingAction(action) {
  try { localStorage.setItem(PENDING_KEY, JSON.stringify({ ...action, ts: Date.now() })) } catch {}
}

function takePendingAction() {
  try {
    const raw = localStorage.getItem(PENDING_KEY)
    if (!raw) return null
    localStorage.removeItem(PENDING_KEY)
    const a = JSON.parse(raw)
    if (!a || Date.now() - (a.ts || 0) > 30 * 60 * 1000) return null
    return a
  } catch { return null }
}

const CartContext = createContext(/** @type {any} */ (null))

export function CartProvider({ children }) {
  const { t } = useI18n()
  const { chargeCurrency } = useCurrency()
  const [cart, setCart] = useState([])
  const [guestPrints, setGuestPrints] = useState([])
  const [guestCart, setGuestCart] = useState([])
  const [limitedPrints, setLimitedPrints] = useState([])
  const [limitedCart, setLimitedCart] = useState([])
  const [loadingCart, setLoadingCart] = useState(true)
  const [user, setUser] = useState(null)
  
  const router = useRouter()

  const persistGuestPrints = (items) => {
    const next = normalizeGuestCart(items)
    try { localStorage.setItem(GUEST_CART_KEY, JSON.stringify(next)) } catch {}
    setGuestPrints(next)
  }


  const persistLimitedPrints = (userId, items) => {
    const next = normalizeGuestCart(items)
    try { localStorage.setItem(limitedPrintStorageKey(userId), JSON.stringify(next)) } catch {}
    setLimitedPrints(next)
  }

  useEffect(() => {
    try {
      const parsed = JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]')
      setGuestPrints(normalizeGuestCart(parsed))
    } catch { setGuestPrints([]) }
  }, [])

  useEffect(() => {
    let active = true
    const hydrate = async () => {
      if (!guestPrints.length) return setGuestCart([])
      const ids = [...new Set(guestPrints.map(i => i.variantId))]
      const response = await fetch('/api/checkout/open-edition/variants?ids=' + encodeURIComponent(ids.join(',')), { cache: 'no-store' })
      if (!response.ok) throw new Error('variant_price_refresh_failed')
      const { variants } = await response.json()
      const byVariant = new Map((variants || []).map(v => [v.id, v]))
      const ready = guestPrints.flatMap(i => {
        const v = byVariant.get(i.variantId), a = v?.artwork
        if (!v || !a || v.artwork_id !== i.id || !v.is_active || v.edition_type !== 'OPEN') return []
        return [{ ...i, sku: a.sku, title: a.title + ' · ' + v.size + ' · ' + v.finish,
          price: Number(v.price), size: v.size, finish: v.finish, edition_type: v.edition_type,
          image: v.resolved_print_image_url || a.primary_image_url,
          primary_image_url: a.primary_image_url }]
      })
      if (active) setGuestCart(ready)
    }
    hydrate().catch(error => { console.error('Guest print cart refresh failed', error.message) })
    return () => { active = false }
  }, [guestPrints])

  useEffect(() => {
    if (!user?.id) { setLimitedPrints([]); setLimitedCart([]); return }
    try { setLimitedPrints(normalizeGuestCart(JSON.parse(localStorage.getItem(limitedPrintStorageKey(user.id)) || '[]'))) }
    catch { setLimitedPrints([]) }
  }, [user?.id])

  useEffect(() => {
    let active = true
    const hydrate = async () => {
      if (!user?.id || !limitedPrints.length) { if (active) setLimitedCart([]); return }
      const ids = [...new Set(limitedPrints.map(i => i.variantId))]
      const response = await fetch('/api/checkout/open-edition/variants?ids=' + encodeURIComponent(ids.join(',')), { cache: 'no-store' })
      if (!response.ok) throw new Error('limited_variant_refresh_failed')
      const { variants } = await response.json()
      const byVariant = new Map((variants || []).map(v => [v.id, v]))
      const ready = limitedPrints.flatMap(i => {
        const v = byVariant.get(i.variantId), a = v?.artwork
        if (!v || !a || v.artwork_id !== i.id || !v.is_active || v.edition_type !== 'LIMITED') return []
        return [{ ...i, sku: a.sku, title: a.title + ' · ' + v.size + ' · ' + v.finish,
          price: Number(v.price), size: v.size, finish: v.finish, edition_type: 'LIMITED',
          image: v.resolved_print_image_url || a.primary_image_url, primary_image_url: a.primary_image_url }]
      })
      if (active) setLimitedCart(ready)
    }
    hydrate().catch(error => { console.error('Limited print cart refresh failed', error.message) })
    return () => { active = false }
  }, [limitedPrints, user?.id])

// 1. Cargar la sesión y los ítems del carrito desde Supabase
const fetchCartItems = async (userId) => {
  try {
    setLoadingCart(true)

    // Paso 1: Obtener las filas de cart_items
    const { data: cartData, error: cartError } = await supabase
      .from('cart_items')
      .select('id, artwork_id, item_type, quantity')
      .eq('user_id', userId)

    if (cartError) {
      console.error('Error de Supabase cart_items:', cartError.message || cartError)
      return
    }

    if (!cartData || cartData.length === 0) {
      setCart([])
      return
    }

    // Paso 2: Obtener las obras asociadas (incluyendo todas las variaciones del nombre de la columna de imagen)
    const artworkIds = cartData.map(item => item.artwork_id)
    const { data: artworksData, error: artworksError } = await supabase
      .from('artworks')
      .select('id, sku, title, base_price_mxn, calculated_price_mxn, primary_image_url')
      .in('id', artworkIds)

    if (artworksError) {
      console.error('Error obteniendo obras para el carrito:', artworksError.message || artworksError)
      return
    }

    // Mapa para rápido acceso (AQUÍ SE DEFINE ARTWORKMAP)
    const artworkMap = new Map((artworksData || []).map(art => [art.id, art]))

    // Paso 3: Mapear resultado final
    const formattedItems = cartData
      .map((ci) => {
        const artwork = artworkMap.get(ci.artwork_id)
        if (!artwork) return null

        // Resolver la imagen considerando las posibles columnas de la tabla
        const rawImage = artwork.primary_image_url || artwork.image_url || artwork.image || null

        return {
          cartItemId: ci.id,
          id: artwork.id,
          sku: artwork.sku,
          title: artwork.title,
          price: artwork.base_price_mxn || artwork.calculated_price_mxn || 0,
          image: rawImage,
          type: ci.item_type,
          quantity: ci.quantity
        }
      })
      .filter(Boolean)

    setCart(formattedItems)
  } catch (err) {
    console.error('Error inesperado cargando el carrito:', err)
  } finally {
    setLoadingCart(false)
  }
}

  useEffect(() => {
    const initAuth = async () => {
      const { data: { session } } = await supabase.auth.getSession()
      if (session?.user) {
        setUser(session.user)
        await fetchCartItems(session.user.id)
        resumePending(session.user)
      } else {
        setUser(null)
        setCart([])
        setLoadingCart(false)
      }
    }

    // Reanuda la acción pendiente (agregar al carrito o comprar) tras iniciar sesión
    let resuming = false
    const resumePending = async (sessionUser) => {
      if (resuming) return
      const pending = takePendingAction()
      if (!pending?.item?.id) return
      resuming = true
      try {
        if (pending.type === 'buy') {
          const response = await fetch('/api/checkout', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', ...(await authHeaders()) },
            body: JSON.stringify({ userId: sessionUser.id, currency: pending.currency || chargeCurrency, cartItems: [{ ...pending.item, type: 'ORIGINAL', quantity: 1 }] }),
          })
          const data = await response.json().catch(() => ({}))
          if (response.ok && data.url) { window.location.href = data.url; return }
        }
        if (pending.item.type === 'PRINT' && pending.item.variantId) {
          // Preserve the specific variant when returning from the sign-in page.
          let saved = []
          try { saved = normalizeGuestCart(JSON.parse(localStorage.getItem(GUEST_CART_KEY) || '[]')) } catch {}
          if (pending.item.edition_type === 'LIMITED') {
            let existing = []
            try { existing = normalizeGuestCart(JSON.parse(localStorage.getItem(limitedPrintStorageKey(sessionUser.id)) || '[]')) } catch {}
            persistLimitedPrints(sessionUser.id, [...existing, { id: pending.item.id, variantId: pending.item.variantId, type: 'PRINT', quantity: 1 }])
          } else {
            persistGuestPrints([...saved, { id: pending.item.id, variantId: pending.item.variantId, type: 'PRINT', quantity: 1 }])
          }
        } else {
          await supabase.from('cart_items').upsert(
            { user_id: sessionUser.id, artwork_id: pending.item.id, item_type: pending.item.type || 'ORIGINAL', quantity: 1 },
            { onConflict: 'user_id,artwork_id' }
          )
          await fetchCartItems(sessionUser.id)
        }
        router.push('/cart')
      } catch (err) {
        console.error('Error reanudando la acción pendiente:', err)
      } finally {
        resuming = false
      }
    }

    initAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchCartItems(session.user.id)
        resumePending(session.user)
      } else {
        setUser(null)
        setCart([])
        setLoadingCart(false)
      }
    })

    return () => authListener.subscription?.unsubscribe()
  }, [])

  // 2. Función para agregar ítem
  const addToCart = async (artwork) => {
    if (artwork.type === 'PRINT' && artwork.variantId) {
      const response = await fetch('/api/checkout/open-edition/variants?ids=' + encodeURIComponent(artwork.variantId), { cache: 'no-store' })
      if (response.ok) {
        const { variants } = await response.json()
        const variant = variants?.[0]
        if (variant && variant.artwork_id === artwork.id && variant.is_active && (variant.edition_type === 'OPEN' || (variant.edition_type === 'LIMITED' && user))) {
          if (printCartBucket(variant.edition_type, user.id) === 'collector') {
            persistLimitedPrints(user.id, [...limitedPrints, { id: artwork.id, variantId: artwork.variantId, type: 'PRINT', quantity: 1 }])
          } else {
            persistGuestPrints([...guestPrints, { id: artwork.id, variantId: artwork.variantId, type: 'PRINT', quantity: 1 }])
          }
          return true
        }
      }
      // LIMITED prints require authentication but retain the exact variant ID.
    }
    if (!user) {
      savePendingAction({ type: 'cart', item: { id: artwork.id, type: artwork.type || 'ORIGINAL', variantId: artwork.variantId || null, edition_type: artwork.edition_type || 'LIMITED' } })
      const destination = window.location.pathname + window.location.search
      router.push(`/login?redirect=${encodeURIComponent(destination)}`)
      return false
    }

    if (artwork.type === 'PRINT' && artwork.variantId) return false
    try {
      const { error } = await supabase
        .from('cart_items')
        .upsert(
          {
            user_id: user.id,
            artwork_id: artwork.id,
            item_type: artwork.type || 'ORIGINAL',
            quantity: 1
          },
          { onConflict: 'user_id,artwork_id' }
        )

      if (error) {
        console.error('Error insertando en cart_items:', error.message || error)
        throw error
      }

      await fetchCartItems(user.id)
      return true
    } catch (err) {
      console.error('Error agregando obra al carrito:', err)
      alert(t('No se pudo agregar la obra al carrito.', 'Could not add the artwork to the cart.'))
      return false
    }
  }

  // 3. Remover ítem
  const removeFromCart = async (artworkId, type = 'ORIGINAL', variantId = null) => {
    if (type === 'PRINT' && variantId) {
      persistGuestPrints(guestPrints.filter(i => cartKey(i) !== cartKey({ id: artworkId, type, variantId })))
      if (user?.id) persistLimitedPrints(user.id, limitedPrints.filter(i => cartKey(i) !== cartKey({ id: artworkId, type, variantId })))
      return
    }
    if (!user) return

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', user.id)
        .eq('artwork_id', artworkId)

      if (error) throw error

      setCart((prev) => prev.filter((item) => item.id !== artworkId))
    } catch (err) {
      console.error('Error eliminando del carrito:', err)
    }
  }

  // A paid print-only checkout must not erase originals waiting in the cart.
  const clearGuestPrintCart = () => {
    persistGuestPrints([])
    setGuestCart([])
  }

  const clearRegisteredCart = async () => {
    if (!user) { setCart([]); return }

    try {
      const { error } = await supabase
        .from('cart_items')
        .delete()
        .eq('user_id', user.id)

      if (error) throw error

      setCart([])
    } catch (err) {
      console.error('Error vaciando el carrito:', err)
    }
  }

  const clearCart = async () => {
    clearGuestPrintCart()
    if (user?.id) persistLimitedPrints(user.id, [])
    await clearRegisteredCart()
  }

  // Preserve existing registered cart entries, including legacy LIMITED prints.
  const combinedCart = [...cart, ...guestCart, ...limitedCart]
  const total = combinedCart.reduce((acc, item) => acc + (item.price || 0) * (item.quantity || 1), 0)

  return (
    <CartContext.Provider
      value={{
        cart: combinedCart,
        loadingCart,
        addToCart,
        removeFromCart,
        clearCart,
        clearGuestPrintCart,
        clearRegisteredCart,
        total,
        user
      }}
    >
      {children}
    </CartContext.Provider>
  )
}

export const useCart = () => {
  const context = useContext(CartContext)
  if (!context) {
    throw new Error('useCart debe usarse dentro de CartProvider')
  }
  return context
}