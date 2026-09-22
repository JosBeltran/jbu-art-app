'use client'

import { useState, useEffect, useCallback } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'

import { supabase } from '@/lib/supabaseClient'
import { useCart } from '@/context/CartContext'
import CartDrawer from '@/components/CartDrawer'
import { getUserLevelInfo } from '@/lib/userLevels'
import { useAppTheme } from '@/components/AppThemeProvider'


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
  Search,
  Favorite,
  Moon,
  Sun,
} from '@carbon/icons-react'

export default function Navbar() {
  const [user, setUser] = useState<any>(null)
  const [profile, setProfile] = useState<any>(null)
  const [isDrawerOpen, setIsDrawerOpen] = useState(false)
  const [loading, setLoading] = useState(true)
  const [isMobileNavOpen, setIsMobileNavOpen] = useState(false)

  const { cart } = useCart()
  const { dark, toggleTheme } = useAppTheme()
  const pathname = usePathname()

  const itemCount = cart.reduce(
    (acc, item) => acc + (item.quantity || 1),
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
    currentLevel?.title ||
    'Coleccionista'

  /*
   * =========================================================
   * PUBLIC NAVIGATION
   * =========================================================
   */

  const publicNavigation = [
    {
      label: 'Obras',
      href: '/catalog',
    },
    {
      label: 'Colecciones',
      href: '/collections',
    },
    {
      label: 'Estudio',
      href: '/studio',
    },
    {
      label: 'Sobre JBU',
      href: '/about',
    },
  ]

  /*
   * =========================================================
   * ACTIVE ROUTE
   * =========================================================
   */

  const isActive = (href: string) => {
    if (href === '/catalog') {
      return pathname === '/catalog'
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
                ? 'Cerrar menú'
                : 'Abrir menú'
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
            JBU
          </HeaderName>

          {/* =================================================
              DESKTOP NAVIGATION
              ================================================= */}

          <HeaderNavigation
            aria-label="Navegación principal"
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
              ================================================= */}

          <HeaderGlobalBar>

            {/* Theme toggle */}

            <HeaderGlobalAction
              aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              tooltipAlignment="center"
              onClick={toggleTheme}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </HeaderGlobalAction>

            {/* Search */}

            <HeaderGlobalAction
              aria-label="Buscar obras"
              tooltipAlignment="center"
            >
              <Search size={20} />
            </HeaderGlobalAction>

            {/* Favorites */}

            <HeaderGlobalAction
              aria-label="Favoritos"
              tooltipAlignment="center"
            >
              <Favorite size={20} />
            </HeaderGlobalAction>

            {/* Cart */}

            <HeaderGlobalAction
              aria-label={`Ver carrito${
                itemCount > 0
                  ? `, ${itemCount} ${
                      itemCount === 1
                        ? 'artículo'
                        : 'artículos'
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
            </HeaderGlobalAction>

            {/* =================================================
                AUTHENTICATION
                ================================================= */}

            {loading ? (
              <HeaderGlobalAction
                aria-label="Cargando cuenta"
                disabled
              >
                <UserIcon size={20} />
              </HeaderGlobalAction>
            ) : !user ? (
              <Link
                href="/login"
                passHref
              >
                <HeaderGlobalAction
                  aria-label="Iniciar sesión"
                  tooltipAlignment="center"
                  as="a"
                >
                  <Login size={20} />
                </HeaderGlobalAction>
              </Link>
            ) : (
              <>
                {isAdmin && (
  <HeaderGlobalAction
    aria-label="Panel de administración"
    tooltipAlignment="center"
    as="a"
    href="/admin"
  >
    <Settings size={20} />
  </HeaderGlobalAction>
)}

                {/* Collector */}

               <HeaderGlobalAction
  aria-label={`Mi espacio de coleccionista: ${levelTitle}`}
  tooltipAlignment="center"
  as="a"
  href="/profile"
>
  <UserIcon size={20} />
</HeaderGlobalAction>
              </>
            )}
          </HeaderGlobalBar>
        </Header>

        {/* ===================================================
            SECONDARY PUBLIC NAVIGATION
            =================================================== */}

        <nav
          aria-label="Navegación pública"
          className="
            hidden
            h-12
            items-center
            justify-center
            border-b
            border-[var(--cds-border-subtle)]
            bg-[var(--cds-background)]
            lg:flex
          "
        >
          <div
            className="
              flex
              h-full
              items-center
              gap-10
            "
          >
            {publicNavigation.map((item) => (
              <Link
                key={item.href}
                href={item.href}
                className={`
                  cds--type-label-01
                  relative
                  flex
                  h-full
                  items-center
                  text-[var(--cds-text-primary)]
                  transition-colors
                  hover:text-[var(--cds-link-primary)]
                  focus:outline-none
                  focus-visible:ring-2
                  focus-visible:ring-[var(--cds-focus)]
                  focus-visible:ring-inset
                  ${
                    isActive(item.href)
                      ? 'text-[var(--cds-link-primary)]'
                      : ''
                  }
                `}
              >
                {item.label}

                {isActive(item.href) && (
                  <span
                    aria-hidden="true"
                    className="
                      absolute
                      bottom-0
                      left-0
                      right-0
                      h-0.5
                      bg-[var(--cds-link-primary)]
                    "
                  />
                )}
              </Link>
            ))}
          </div>
        </nav>

        {/* ===================================================
            MOBILE PUBLIC NAVIGATION
            =================================================== */}
<div className="lg:hidden">
  
        <SideNav
          aria-label="Navegación pública móvil"
          expanded={isMobileNavOpen}
          isChildOfHeader
          className="lg:hidden"
        >
          <SideNavItems>

            {/* Public pages */}

            {publicNavigation.map((item) => (
              <SideNavLink
                key={item.href}
                href={item.href}
                isActive={isActive(item.href)}
                onClick={closeMobileNav}
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
                    isActive={pathname.startsWith(
                      '/profile'
                    )}
                    onClick={closeMobileNav}
                  >
                    Mi espacio de
                    coleccionista
                  </SideNavLink>
                ) : (
                  <SideNavLink
                    href="/login"
                    isActive={pathname.startsWith(
                      '/login'
                    )}
                    onClick={closeMobileNav}
                  >
                    Iniciar sesión
                  </SideNavLink>
                )}

                {/* =================================================
                    ADMIN
                    ================================================= */}

                {user && isAdmin && (
                  <SideNavLink
                    href="/admin"
                    isActive={pathname.startsWith(
                      '/admin'
                    )}
                    onClick={closeMobileNav}
                  >
                    Administración
                  </SideNavLink>
                )}
              </>
            )}
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