// context/CartContext.jsx
'use client'

import { createContext, useContext, useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { useRouter } from 'next/navigation'

const CartContext = createContext(null)

export function CartProvider({ children }) {
  const [cart, setCart] = useState([])
  const [loadingCart, setLoadingCart] = useState(true)
  const [user, setUser] = useState(null)
  
  const router = useRouter()


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
      } else {
        setUser(null)
        setCart([])
        setLoadingCart(false)
      }
    }

    initAuth()

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      if (session?.user) {
        setUser(session.user)
        await fetchCartItems(session.user.id)
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
    if (!user) {
      alert('Debes iniciar sesión para agregar obras a tu colección.')
      router.push('/login')
      return false
    }

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
      alert('No se pudo agregar la obra al carrito.')
      return false
    }
  }

  // 3. Remover ítem
  const removeFromCart = async (artworkId) => {
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

  // 4. Vaciar carrito
  const clearCart = async () => {
    if (!user) return

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

  const total = cart.reduce((acc, item) => acc + (item.price || 0) * (item.quantity || 1), 0)

  return (
    <CartContext.Provider
      value={{
        cart,
        loadingCart,
        addToCart,
        removeFromCart,
        clearCart,
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