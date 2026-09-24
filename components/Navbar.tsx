'use client'

import LogoJBU from '@/components/jbu/LogoJBU'
import { useState, useEffect, useCallback } from 'react'
import { usePathname } from 'next/navigation'

import { supabase } from '@/lib/supabaseClient'
import { useCart } from '@/context/CartContext'
import CartDrawer from '@/components/CartDrawer'
import { getUserLevelInfo } from '@/lib/userLevels'
import { useAppTheme } from '@/components/AppThemeProvider'
import { useI18n } from '@/components/I18nProvider'
import LanguageToggle from '@/components/LanguageToggle'


import {
  Header,
  HeaderName,
  HeaderNavigation,
  HeaderMenuItem,
  HeaderGlobalBar,
  HeaderGlobalAction,
  HeaderMenuButton,
  SideNav,
  SideNavItems,
  SideNavLink,
} from '@carbon/react'

import {
  ShoppingCart,
  User as UserIcon,
  Settings,
  Login,
  Grid,
  Information,
  Moon,
  Sun,
} from '@carbon/icons-react'

const HGA: any = HeaderGlobalAction

export default function Navbar() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const { cart } = useCart()
  const { dark, toggleTheme } = useAppTheme()
  const { t } = useI18n()
  const pathname = usePathname()

  const itemCount = cart.reduce(
    (acc: number, item: any) => acc + (item.quantity || 1),
    0
  )

  /*
   * =========================================================
   * PROFILE
   * =========================================================
   */

  const loadProfileData = useCallback(
    async (userId: string, userEmail = '') => {
      if (!userId) {
        setProfile(null)
        return
      }

      try {
        const [profileRes, userRes] = await Promise.all([
          supabase
            .from('profiles')
            .select('*')
            .eq('id', userId)
            .maybeSingle(),

          supabase
            .from('users')
            .select(
              'user_xp, role, display_name, full_name'
            )
            .eq('id', userId)
            .maybeSingle(),
        ])

        let profileData = profileRes.data
        const userData = userRes.data

        /*
         * Fallback existente:
         * buscar perfil por email si no se encontró
         * correctamente por ID.
         */
        if ((!profileData || !profileData.xp) && userEmail) {
          const { data: profileByEmail } = await supabase
            .from('profiles')
            .select('*')
            .ilike('email', userEmail)
            .maybeSingle()

          if (profileByEmail) {
            profileData = profileByEmail
          }
        }

        const xpValue =
          profileData?.xp ??
          profileData?.user_xp ??
          userData?.user_xp ??
          0

        if (profileData) {
          setProfile({
            ...profileData,
            user_xp: xpValue,
          })
        } else if (userData) {
          setProfile({
            ...userData,
            user_xp: xpValue,
          })
        } else {
          setProfile(null)
        }
      } catch (error) {
        console.error(
          'Error cargando perfil:',
          error
        )
      }
    },
    []
  )

  /*
   * =========================================================
   * AUTH
   * =========================================================
   */

  useEffect(() => {
    let isMounted = true

    const initializeAuth = async () => {
      const {
        data: { session },
      } = await supabase.auth.getSession()

      const activeUser = session?.user || null

      if (!isMounted) return

      setUser(activeUser)

      if (activeUser) {
        await loadProfileData(
          activeUser.id,
          activeUser.email || ''
        )
      } else {
        setProfile(null)
      }

      if (isMounted) {
        setLoading(false)
      }
    }

    initializeAuth()

    const {
      data: authListener,
    } = supabase.auth.onAuthStateChange(
      async (_event, session) => {
        const activeUser =
          session?.user || null

        if (!isMounted) return

        setUser(activeUser)

        if (activeUser) {
          await loadProfileData(
            activeUser.id,
            activeUser.email || ''
          )
        } else {
          setProfile(null)
        }

        if (isMounted) {
          setLoading(false)
        }
      }
    )

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [loadProfileData])

  /*
   * =========================================================
   * USER / ROLE
   * =========================================================
   */

  const roleUpper = profile?.role
    ? String(profile.role).toUpperCase()
    : ''

  const isAdmin =
    roleUpper === 'ADMIN' ||
    roleUpper === 'ADMINISTRADOR' ||
    user?.email === 'josue.beltran.u@gmail.com'

  const userXp =
    profile?.user_xp ||
    profile?.xp ||
    0

  const { currentLevel } =
    getUserLevelInfo(userXp)

  const levelTitle =
    currentLevel?.name ||
    (currentLevel as any)?.title ||
    t('Coleccionista', 'Collector')

  /*
   * =========================================================
   * PUBLIC NAVIGATION
   * =========================================================
   */

  const publicNavigation = [
    {
      label: t('Obras', 'Artworks'),
      href: '/catalog',
    },
    {
      label: t('Cómo funciona', 'How it works'),
      href: '/como-funciona',
    },
  ]

  /*
   * =========================================================
   * ACTIVE ROUTE
   * =========================================================
   */

  const isActive = (href: string) => {
    if (href === '/catalog') {
      return (
        pathname === '/catalog' ||
        pathname.startsWith('/artwork')
      )
    }

    return (
      pathname === href ||
      pathname.startsWith(`${href}/`)
    )
  }

  /*
   * =========================================================
   * MOBILE NAV
   * =========================================================
   */

  const closeMobileNav = () => {
    setIsMobileNavOpen(false)
  }

  /*
   * =========================================================
   * RENDER
   * =========================================================
   */

  return (
    <>
      <div className="fixed top-0 left-0 z-50 w-full">

        {/* ===================================================
            PRIMARY CARBON HEADER
            =================================================== */}

        <Header aria-label="JBU Art">

          {/* Mobile menu button */}
          <div className="lg:hidden">
            <HeaderMenuButton
              aria-label={
                isMobileNavOpen
                  ? t('Cerrar menú', 'Close menu')
                  : t('Abrir menú', 'Open menu')
              }
              isActive={isMobileNavOpen}
              onClick={() =>
                setIsMobileNavOpen(
                  (current) => !current
                )
              }
            />
          </div>

          {/* Brand */}

          <HeaderName
            href="/"
            prefix=""
          >
            <span style={{ display: 'inline-flex', alignItems: 'center' }}>
              <LogoJBU variant="neutral" size={22} title="JBU" />
            </span>
          </HeaderName>

          {/* =================================================
              DESKTOP NAVIGATION
              ================================================= */}

          <HeaderNavigation
            aria-label={t('Navegación principal', 'Main navigation')}
            className="hidden lg:flex"
          >
            {publicNavigation.map((item) => (
              <HeaderMenuItem
                key={item.href}
                href={item.href}
                isCurrentPage={isActive(
                  item.href
                )}
              >
                {item.label}
              </HeaderMenuItem>
            ))}
          </HeaderNavigation>

          {/* =================================================
              GLOBAL ACTIONS
              Móvil: carrito · Escritorio: carrito · cuenta · idioma · tema
              ================================================= */}

          <HeaderGlobalBar>
            {/* Cart */}

            <HGA
              aria-label={`${t('Ver carrito', 'View cart')}${
                itemCount > 0
                  ? `, ${itemCount} ${
                      itemCount === 1
                        ? t('artículo', 'item')
                        : t('artículos', 'items')
                    }`
                  : ''
              }`}
              tooltipAlignment="center"
              onClick={() =>
                setIsDrawerOpen(true)
              }
              className="relative"
            >
              <ShoppingCart size={20} />

              {itemCount > 0 && (
                <span
                  aria-hidden="true"
                  className="
                    absolute
                    top-1
                    right-1
                    flex
                    h-4
                    min-w-4
                    items-center
                    justify-center
                    rounded-full
                    bg-[var(--cds-support-error)]
                    px-1
                    text-[10px]
                    font-semibold
                    leading-none
                    text-[var(--cds-text-on-color)]
                  "
                >
                  {itemCount}
                </span>
              )}
            </HGA>

            {/* =================================================
                AUTHENTICATION
                ================================================= */}

            <div className="hidden lg:flex">
              {loading ? (
                <HGA
                  aria-label={t('Cargando cuenta', 'Loading account')}
                  disabled
                >
                  <UserIcon size={20} />
                </HGA>
              ) : !user ? (
                <HGA
                  aria-label={t('Iniciar sesión', 'Sign in')}
                  tooltipAlignment="center"
                  as="a"
                  href="/login"
                >
                  <Login size={20} />
                </HGA>
              ) : (
                <>
                  {isAdmin && (
                    <HGA
                      aria-label={t('Panel de administración', 'Admin panel')}
                      tooltipAlignment="center"
                      as="a"
                      href="/admin"
                    >
                      <Settings size={20} />
                    </HGA>
                  )}

                  <HGA
                    aria-label={`${t('Mi espacio de coleccionista', 'My collector space')}: ${levelTitle}`}
                    tooltipAlignment="center"
                    as="a"
                    href="/profile"
                  >
                    <UserIcon size={20} />
                  </HGA>
                </>
              )}

              <LanguageToggle />

              <HGA
                aria-label={dark ? t('Cambiar a modo claro', 'Switch to light mode') : t('Cambiar a modo oscuro', 'Switch to dark mode')}
                tooltipAlignment="center"
                onClick={toggleTheme}
              >
                {dark ? <Sun size={20} /> : <Moon size={20} />}
              </HGA>
            </div>
          </HeaderGlobalBar>
        </Header>

        {/* ===================================================
            MOBILE PUBLIC NAVIGATION
            =================================================== */}
        <div className="lg:hidden">
          <SideNav
            aria-label={t('Navegación pública móvil', 'Mobile public navigation')}
            expanded={isMobileNavOpen}
            isChildOfHeader
            className="lg:hidden"
          >
            <SideNavItems>
              <div className="px-4 py-2">
                <LanguageToggle />
              </div>

              {/* Public pages */}

              {publicNavigation.map((item) => (
                <SideNavLink
                  key={item.href}
                  href={item.href}
                  isActive={isActive(item.href)}
                  onClick={closeMobileNav}
                  renderIcon={item.href === '/catalog' ? Grid : Information}
                >
                  {item.label}
                </SideNavLink>
              ))}

              {/* =================================================
                  ACCOUNT
                  ================================================= */}

              {!loading && (
                <>
                  {user ? (
                    <SideNavLink
                      href="/profile"
                      renderIcon={UserIcon}
                      isActive={pathname.startsWith(
                        '/profile'
                      )}
                      onClick={closeMobileNav}
                    >
                      {t('Mi espacio de coleccionista', 'My collector space')}
                    </SideNavLink>
                  ) : (
                    <SideNavLink
                      href="/login"
                      renderIcon={Login}
                      isActive={pathname.startsWith(
                        '/login'
                      )}
                      onClick={closeMobileNav}
                    >
                      {t('Iniciar sesión', 'Sign in')}
                    </SideNavLink>
                  )}

                  {/* =================================================
                      ADMIN
                      ================================================= */}

                  {user && isAdmin && (
                    <SideNavLink
                      href="/admin"
                      renderIcon={Settings}
                      isActive={pathname.startsWith(
                        '/admin'
                      )}
                      onClick={closeMobileNav}
                    >
                      {t('Administración', 'Admin')}
                    </SideNavLink>
                  )}
                </>
              )}

              <SideNavLink
                href="#"
                renderIcon={dark ? Sun : Moon}
                onClick={(event) => {
                  event.preventDefault()
                  toggleTheme()
                }}
              >
                {dark
                  ? t('Modo claro', 'Light mode')
                  : t('Modo oscuro', 'Dark mode')}
              </SideNavLink>
            </SideNavItems>
          </SideNav>
        </div>
      </div>
      {/* =====================================================
          CART DRAWER
          ===================================================== */}

      <CartDrawer
        isOpen={isDrawerOpen}
        onClose={() =>
          setIsDrawerOpen(false)
        }
      />
    </>
  )
}
