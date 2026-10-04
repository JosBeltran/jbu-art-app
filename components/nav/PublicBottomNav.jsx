'use client'

import { usePathname } from 'next/navigation'
import { Home, Grid, Information, User, ShoppingCart } from '@carbon/icons-react'
import { useCart } from '@/context/CartContext'
import { useI18n } from '@/components/I18nProvider'
import MobileBottomNav from './MobileBottomNav'

export default function PublicBottomNav() {
  const pathname = usePathname() || '/'
  const { cart, user } = useCart()
  const { t } = useI18n()
  const count = (cart || []).reduce((acc, item) => acc + (item.quantity || 1), 0)
  const accountHref = user ? '/profile' : '/login'

  const items = [
    { key: 'home', label: t('Inicio', 'Home'), icon: Home, href: '/', active: pathname === '/' || pathname === '/landing' },
    { key: 'catalog', label: t('Obras', 'Artworks'), icon: Grid, href: '/catalog', active: pathname.startsWith('/catalog') || pathname.startsWith('/artwork') },
    { key: 'how', label: t('Cómo funciona', 'How it works'), icon: Information, href: '/como-funciona', active: pathname.startsWith('/como-funciona') },
    { key: 'account', label: user ? t('Mi espacio', 'My space') : t('Entrar', 'Sign in'), icon: User, href: accountHref, active: pathname.startsWith('/login') || pathname.startsWith('/signup') },
    {
      key: 'cart',
      label: t('Carrito', 'Cart'),
      icon: ShoppingCart,
      href: '/cart',
      badge: count,
      active: pathname.startsWith('/cart') || pathname.startsWith('/checkout'),
      ariaLabel: `${t('Carrito', 'Cart')}${count > 0 ? `, ${count}` : ''}`,
    },
  ]

  return <MobileBottomNav ariaLabel={t('Navegación principal', 'Main navigation')} items={items} />
}
