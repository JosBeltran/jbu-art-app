// context/CartContext.jsx
'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'
import { useI18n } from '@/components/I18nProvider'
import { useCurrency } from '@/components/CurrencyProvider'
import { authHeaders } from '@/lib/authHeaders'
import { cartKey, collectorPrintCartKey, GUEST_CART_KEY, hydratePrintCart, normalizeGuestCart } from '@/lib/guestPrintCart'

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

function storedPrints(key) {
  try { return normalizeGuestCart(JSON.parse(localStorage.getItem(key) || '[]')) } catch { return [] }
}

async function fetchPrintVariants(ids) {
  const variants = []
  for (let i = 0; i < ids.length; i += 25) {
    const response = await fetch('/api/checkout/open-edition/variants?ids=' +
      encodeURIComponent(ids.slice(i, i + 25).join(',')), { cache: 'no-store' })
    if (!response.ok) throw new Error('variant_price_refresh_failed')
    variants.push(...(await response.json()).variants)
  }
  return variants
}

const CartContext = createContext(/** @type {any} */ (null))

export function CartProvider({ children }) {
  const { t } = useI18n()
  const { chargeCurrency } = useCurrency()
  const [cart, setCart] = useState([])
  const [guestPrints, setGuestPrints] = useState([])
  const [limitedPrints, setLimitedPrints] = useState({ owner: null, items: [] })
  const [printCart, setPrintCart] = useState({ owner: null, open: [], limited: [] })
  const [loadingCart, setLoadingCart] = useState(true)
  const [user, setUser] = useState(null)
  const userId = user?.id
  const router = useRouter()

  function writePrints(key, items, owner = null) {
    const next = normalizeGuestCart(items)
    try { localStorage.setItem(key, JSON.stringify(next)) } catch {}
    if (owner) setLimitedPrints({ owner, items: next })
    else setGuestPrints(next)
  }

  function saveVariant(item, variant, buyer) {
    const owner = variant.edition_type === 'LIMITED' ? buyer?.id : null
    if (variant.edition_type !== 'OPEN' && !owner) return false
    const key = owner ? collectorPrintCartKey(owner) : GUEST_CART_KEY
    writePrints(key, [...storedPrints(key), { id: item.id, variantId: variant.id, type: 'PRINT', quantity: 1 }], owner)
    return true
  }

  useEffect(() => { setGuestPrints(storedPrints(GUEST_CART_KEY)) }, [])
  useEffect(() => {
    setLimitedPrints({ owner: userId, items: userId ? storedPrints(collectorPrintCartKey(userId)) : [] })
  }, [userId])

  useEffect(() => {
    let active = true
    const limited = limitedPrints.owner === userId ? limitedPrints.items : []
    const ids = [...new Set([...guestPrints, ...limited].map(i => i.variantId))]
    fetchPrintVariants(ids).then(variants => {
      if (active) setPrintCart({
        owner: userId,
        open: hydratePrintCart(guestPrints, variants, 'OPEN', t),
        limited: userId ? hydratePrintCart(limited, variants, 'LIMITED', t) : [],
      })
    }).catch(error => console.error('Print cart refresh failed', error.message))
    return () => { active = false }
  }, [guestPrints, limitedPrints, userId, t])

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
          const [variant] = await fetchPrintVariants([pending.item.variantId])
          if (variant?.artwork_id === pending.item.id) saveVariant(pending.item, variant, sessionUser)
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

    let authUpdate
    const { data: authListener } = supabase.auth.onAuthStateChange((_event, session) => {
      clearTimeout(authUpdate)
      const buyer = session?.user || null
      setUser(buyer)
      if (!buyer) {
        setCart([])
        setLoadingCart(false)
        return
      }
      authUpdate = setTimeout(async () => {
        await fetchCartItems(buyer.id)
        await resumePending(buyer)
      }, 0)
    })

    return () => {
      clearTimeout(authUpdate)
      authListener.subscription?.unsubscribe()
    }
  }, [])

  // 2. Función para agregar ítem
  const addToCart = async (artwork) => {
    if (artwork.type === 'PRINT' && artwork.variantId) {
      try {
        const [variant] = await fetchPrintVariants([artwork.variantId])
        if (!variant || variant.artwork_id !== artwork.id) return false
        if (saveVariant(artwork, variant, user)) return true
      } catch {
        return false
      }
    }
    if (!user) {
      savePendingAction({ type: 'cart', item: { id: artwork.id, type: artwork.type || 'ORIGINAL', variantId: artwork.variantId || null } })
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
      const keep = item => cartKey(item) !== cartKey({ id: artworkId, type, variantId })
      writePrints(GUEST_CART_KEY, storedPrints(GUEST_CART_KEY).filter(keep))
      if (userId) {
        const key = collectorPrintCartKey(userId)
        writePrints(key, storedPrints(key).filter(keep), userId)
      }
      setPrintCart(previous => ({ ...previous, open: previous.open.filter(keep), limited: previous.limited.filter(keep) }))
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
    writePrints(GUEST_CART_KEY, [])
    setPrintCart(previous => ({ ...previous, open: [] }))
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
    if (userId) writePrints(collectorPrintCartKey(userId), [], userId)
    setPrintCart(previous => ({ ...previous, limited: [] }))
    await clearRegisteredCart()
  }

  const combinedCart = [...cart, ...printCart.open, ...(userId && printCart.owner === userId ? printCart.limited : [])]
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