'use client'

import { useEffect, useState } from 'react'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
import { useI18n } from '@/components/I18nProvider'
import LanguageToggle from '@/components/LanguageToggle'
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
import collector from './CollectorLayout.module.css'
import LogoJBU from '@/components/jbu/LogoJBU'

const DESKTOP_BREAKPOINT = '(min-width: 66rem)'

export default function AccountLayout({ children }) {
  const { t } = useI18n()
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
        <InlineLoading description={t('Cargando espacio del coleccionista...', "Loading collector's space...")} />
      </div>
    )
  }

  const userXp = profile?.user_xp || 0
  const { currentLevel } = getUserLevelInfo(userXp)
  const levelTitle = currentLevel?.name || t('Coleccionista', 'Collector')
  const displayName = profile?.full_name || profile?.display_name || user?.email

  return (
    <div className={`${styles.shell} ${collector.shell}`}>
      <Header aria-label="JBU Collector Space" className={collector.header}>
        <HeaderMenuButton
          aria-label={isSideNavExpanded ? t('Cerrar menú', 'Close menu') : t('Abrir menú', 'Open menu')}
          isActive={isSideNavExpanded}
          onClick={() => setIsSideNavExpanded((expanded) => !expanded)}
          isCollapsible
        />
        <HeaderName href="/profile" prefix="" className={collector.brand}>
          <LogoJBU variant="primary" size={20} decorative />
          <span className={collector.brandLabel}>
          {t('Espacio del Coleccionista', "Collector's Space")}</span>
        </HeaderName>
        <HeaderGlobalBar>
          <LanguageToggle style={{ marginRight: '0.5rem' }} />
          <HeaderGlobalAction aria-label={t('Ir al catálogo', 'Go to catalog')} onClick={() => { window.location.href = '/catalog' }}>
            <Home size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label={t('Cerrar sesión', 'Sign out')} onClick={handleLogout}>
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <div className={styles.body}>
        {!isDesktop && isSideNavExpanded && (
          <button className={styles.backdrop} aria-label={t('Cerrar menú', 'Close menu')} onClick={() => setIsSideNavExpanded(false)} />
        )}
        <SideNav
          aria-label={t('Menú de cuenta', 'Account menu')}
          expanded={isSideNavExpanded}
          isPersistent={isDesktop}
          className={`${styles.sideNav} ${collector.sideNav}`}
          onOverlayClick={() => setIsSideNavExpanded(false)}
        >
          <SideNavItems>
            <div className={`${styles.userSummary} ${collector.userSummary}`}>
              <p className={collector.navKicker}>{t('Registro privado', 'Private registry')}</p>
              <p className={`${styles.userName} ${collector.userName}`}>{displayName}</p>
              <p className={`${styles.userLevel} ${collector.userLevel}`}>{t('Nivel', 'Level')} {currentLevel?.level ?? 1} · {levelTitle}</p>
            </div>
            <SideNavLink renderIcon={User} href="/profile" isActive={pathname === '/profile'}>
              {t('Mi Perfil & XP', 'My Profile & XP')}
            </SideNavLink>
            <SideNavLink renderIcon={ImageIcon} href="/collection" isActive={pathname === '/collection'}>
              {t('Mi Colección Privada', 'My Private Collection')}
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink renderIcon={Home} href="/catalog">
              {t('Explorar Catálogo', 'Explore Catalog')}
            </SideNavLink>
          </SideNavItems>
        </SideNav>

        <main className={`${styles.main} ${styles.accountMain} ${collector.main}`}>
          <div className={styles.content}>{children}</div>
        </main>
      </div>
    </div>
  )
}
