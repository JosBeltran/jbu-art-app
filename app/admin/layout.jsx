'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import {
  Header,
  HeaderName,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
  SideNavDivider,
  InlineLoading
} from '@carbon/react'
import {
  Folder,
  Document,
  Gift,
  DeliveryTruck,
  UserMultiple,
  Logout,
  Home
} from '@carbon/icons-react'
import styles from '../PanelLayout.module.css'

const DESKTOP_BREAKPOINT = '(min-width: 66rem)'

export default function AdminLayout({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isDesktop, setIsDesktop] = useState(false)
  const [isSideNavExpanded, setIsSideNavExpanded] = useState(false)
  const pathname = usePathname()

  useEffect(() => {
    const media = window.matchMedia(DESKTOP_BREAKPOINT)
    const syncNavigation = () => {
      setIsDesktop(media.matches)
      setIsSideNavExpanded(media.matches)
    }

    syncNavigation()
    media.addEventListener('change', syncNavigation)
    return () => media.removeEventListener('change', syncNavigation)
  }, [])

  useEffect(() => {
    if (!isDesktop) setIsSideNavExpanded(false)
  }, [pathname, isDesktop])

  useEffect(() => {
    async function checkAdminRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      const { data: profile } = await supabase
        .from('profiles')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const { data: userData } = await supabase
        .from('users')
        .select('role')
        .eq('id', user.id)
        .maybeSingle()

      const role = profile?.role || userData?.role || ''
      const roleUpper = String(role).toUpperCase()
      const adminEmails = (process.env.NEXT_PUBLIC_ADMIN_EMAILS || '')
        .split(',')
        .map((email) => email.trim().toLowerCase())
        .filter(Boolean)
      const isUserAdmin = roleUpper === 'ADMIN' || roleUpper === 'ADMINISTRADOR' || adminEmails.includes((user.email || '').toLowerCase())

      if (!isUserAdmin) {
        window.location.href = '/'
        return
      }

      setIsAdmin(true)
      setLoading(false)
    }

    checkAdminRole()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading || !isAdmin) {
    return (
      <div className={styles.loading}>
        <InlineLoading description="Verificando credenciales de administración..." />
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <Header aria-label="JBU Studio Backoffice" className="cds--header cds--header--g100">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? 'Cerrar menú' : 'Abrir menú'}
          isActive={isSideNavExpanded}
          onClick={() => setIsSideNavExpanded((expanded) => !expanded)}
          isCollapsible
        />
        <HeaderName href="/admin" prefix="JBU">
          Studio Backoffice
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction aria-label="Ir al sitio público" onClick={() => { window.location.href = '/' }}>
            <Home size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Cerrar sesión" onClick={handleLogout}>
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <div className={styles.body}>
        {!isDesktop && isSideNavExpanded && (
          <button className={styles.backdrop} aria-label="Cerrar menú" onClick={() => setIsSideNavExpanded(false)} />
        )}
        <SideNav
          aria-label="Menú de administración"
          expanded={isSideNavExpanded}
          isPersistent={isDesktop}
          className={styles.sideNav}
          onOverlayClick={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <SideNavLink renderIcon={Folder} href="/admin/artworks" isActive={pathname.startsWith('/admin/artworks')}>
              Inventario de Obras
            </SideNavLink>
            <SideNavLink renderIcon={DeliveryTruck} href="/admin/orders" isActive={pathname.startsWith('/admin/orders')}>
              Órdenes y Envíos
            </SideNavLink>
            <SideNavLink renderIcon={Document} href="/admin/certificates" isActive={pathname.startsWith('/admin/certificates')}>
              Certificados
            </SideNavLink>
            <SideNavLink renderIcon={Gift} href="/admin/claims" isActive={pathname.startsWith('/admin/claims')}>
              Lotes / Claims
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink renderIcon={UserMultiple} href="/admin/users" isActive={pathname.startsWith('/admin/users')}>
              Directorio Usuarios
            </SideNavLink>
          </SideNavItems>
        </SideNav>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}
