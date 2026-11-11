'use client'

import { usePathname } from 'next/navigation'
import { Home, Grid, Information, Printer, User, ShoppingCart } from '@carbon/icons-react'
import { useCart } from '@/context/CartContext'
import { useI18n } from '@/components/I18nProvider'
import MobileBottomNav from './MobileBottomNav'
import { publicCollectionNavigation } from '@/lib/publicNavigation'

export default function PublicBottomNav() {
  const pathname = usePathname() || '/'
  const { cart, user } = useCart()
  const { t } = useI18n()
  const count = (cart || []).reduce((acc, item) => acc + (item.quantity || 1), 0)
  const accountHref = user ? '/profile' : '/login'

  const items = [
    { key: 'home', label: t('Inicio', 'Home'), icon: Home, href: '/', active: pathname === '/' || pathname === '/landing' },
    ...publicCollectionNavigation(t).map(item => ({
      ...item, icon: { catalog: Grid, prints: Printer, about: Information }[item.key],
      active: pathname.startsWith(item.href) || (item.key === 'catalog' && pathname.startsWith('/artwork')),
    })),
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
