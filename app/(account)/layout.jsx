'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
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
import { User, Image as ImageIcon, Home, Logout } from '@carbon/icons-react'
import styles from '../PanelLayout.module.css'

const DESKTOP_BREAKPOINT = '(min-width: 66rem)'

export default function AccountLayout({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
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
    async function checkAuthAndProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUser(user)

      const [profileRes, userRes] = await Promise.all([
        supabase.from('profiles').select('*').eq('id', user.id).maybeSingle(),
        supabase.from('users').select('user_xp, role, display_name, full_name').eq('id', user.id).maybeSingle()
      ])

      const pData = profileRes.data || userRes.data || {}
      const xpValue = pData.xp ?? pData.user_xp ?? 0
      setProfile({ ...pData, user_xp: xpValue })
      setLoading(false)
    }

    checkAuthAndProfile()
  }, [])

  const handleLogout = async () => {
    await supabase.auth.signOut()
    window.location.href = '/login'
  }

  if (loading) {
    return (
      <div className={styles.loading}>
        <InlineLoading description="Cargando espacio del coleccionista..." />
      </div>
    )
  }

  const userXp = profile?.user_xp || 0
  const { currentLevel } = getUserLevelInfo(userXp)
  const levelTitle = currentLevel?.name || 'Coleccionista'
  const displayName = profile?.full_name || profile?.display_name || user?.email

  return (
    <div className={styles.shell}>
      <Header aria-label="JBU Collector Space" className="cds--header cds--header--g100">
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? 'Cerrar menú' : 'Abrir menú'}
          isActive={isSideNavExpanded}
          onClick={() => setIsSideNavExpanded((expanded) => !expanded)}
          isCollapsible
        />
        <HeaderName href="/profile" prefix="JBU">
          Espacio del Coleccionista
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction aria-label="Ir al catálogo" onClick={() => { window.location.href = '/catalog' }}>
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
          aria-label="Menú de cuenta"
          expanded={isSideNavExpanded}
          isPersistent={isDesktop}
          className={styles.sideNav}
          onOverlayClick={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <div className={styles.userSummary}>
              <p className={styles.userName}>{displayName}</p>
              <p className={styles.userLevel}>Nivel {currentLevel?.level ?? 1} · {levelTitle}</p>
            </div>
            <SideNavLink renderIcon={User} href="/profile" isActive={pathname === '/profile'}>
              Mi Perfil & XP
            </SideNavLink>
            <SideNavLink renderIcon={ImageIcon} href="/collection" isActive={pathname === '/collection'}>
              Mi Colección Privada
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink renderIcon={Home} href="/catalog">
              Explorar Catálogo
            </SideNavLink>
          </SideNavItems>
        </SideNav>

        <main className={`${styles.main} ${styles.accountMain}`}>
          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  )
}
