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
import { useI18n } from '@/components/I18nProvider'
import LanguageToggle from '@/components/LanguageToggle'

const DESKTOP_BREAKPOINT = '(min-width: 66rem)'

export default function AdminLayout({ children }) {
  const { t } = useI18n()
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
        <InlineLoading description={t('Verificando credenciales de administración...', 'Verifying admin credentials...')} />
      </div>
    )
  }

  return (
    <div className={styles.shell}>
      <Header aria-label="JBU Studio Backoffice" className="cds--header cds--header--g100">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? t('Cerrar menú', 'Close menu') : t('Abrir menú', 'Open menu')}
          isActive={isSideNavExpanded}
          onClick={() => setIsSideNavExpanded((expanded) => !expanded)}
          isCollapsible
        />
        <HeaderName href="/admin" prefix="JBU">
          Studio Backoffice
        </HeaderName>
        <HeaderGlobalBar>
          <LanguageToggle style={{ marginRight: '0.5rem' }} />
          <HeaderGlobalAction aria-label={t('Ir al sitio público', 'Go to public site')} onClick={() => { window.location.href = '/' }}>
            <Home size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label={t('Cerrar sesión', 'Log out')} onClick={handleLogout}>
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <div className={styles.body}>
        {!isDesktop && isSideNavExpanded && (
          <button className={styles.backdrop} aria-label={t('Cerrar menú', 'Close menu')} onClick={() => setIsSideNavExpanded(false)} />
        )}
        <SideNav
          aria-label={t('Menú de administración', 'Admin menu')}
          expanded={isSideNavExpanded}
          isPersistent={isDesktop}
          className={styles.sideNav}
          onOverlayClick={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <SideNavLink renderIcon={Folder} href="/admin/artworks" isActive={pathname.startsWith('/admin/artworks')}>
              {t('Inventario de Obras', 'Artwork Inventory')}
            </SideNavLink>
            <SideNavLink renderIcon={DeliveryTruck} href="/admin/orders" isActive={pathname.startsWith('/admin/orders')}>
              {t('Órdenes y Envíos', 'Orders & Shipping')}
            </SideNavLink>
            <SideNavLink renderIcon={Document} href="/admin/certificates" isActive={pathname.startsWith('/admin/certificates')}>
              {t('Certificados', 'Certificates')}
            </SideNavLink>
            <SideNavLink renderIcon={Gift} href="/admin/claims" isActive={pathname.startsWith('/admin/claims')}>
              {t('Lotes / Claims', 'Batches / Claims')}
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink renderIcon={UserMultiple} href="/admin/users" isActive={pathname.startsWith('/admin/users')}>
              {t('Directorio Usuarios', 'User Directory')}
            </SideNavLink>
          </SideNavItems>
        </SideNav>

        <main className={styles.main}>{children}</main>
      </div>
    </div>
  )
}
