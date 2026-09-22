'use client'

import { useState, useEffect, useCallback } from 'react'
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

const HGA: any = HeaderGlobalAction

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
              Orden: Buscar · Favoritos · Carrito · Cuenta · Tema
              ================================================= */}

          <HeaderGlobalBar>

            {/* Search */}

            <HGA
              aria-label="Buscar obras"
              tooltipAlignment="center"
            >
              <Search size={20} />
            </HGA>

            {/* Favorites */}

            <HGA
              aria-label="Favoritos"
              tooltipAlignment="center"
              as="a"
              href="/profile"
            >
              <Favorite size={20} />
            </HGA>

            {/* Cart */}

            <HGA
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
            </HGA>

            {/* =================================================
                AUTHENTICATION
                ================================================= */}

            {loading ? (
              <HGA
                aria-label="Cargando cuenta"
                disabled
              >
                <UserIcon size={20} />
              </HGA>
            ) : !user ? (
              <HGA
                aria-label="Iniciar sesión"
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
                    aria-label="Panel de administración"
                    tooltipAlignment="center"
                    as="a"
                    href="/admin"
                  >
                    <Settings size={20} />
                  </HGA>
                )}

                {/* Collector */}

                <HGA
                  aria-label={`Mi espacio de coleccionista: ${levelTitle}`}
                  tooltipAlignment="center"
                  as="a"
                  href="/profile"
                >
                  <UserIcon size={20} />
                </HGA>
              </>
            )}

            {/* Theme toggle */}

            <HGA
              aria-label={dark ? 'Cambiar a modo claro' : 'Cambiar a modo oscuro'}
              tooltipAlignment="center"
              onClick={toggleTheme}
            >
              {dark ? <Sun size={20} /> : <Moon size={20} />}
            </HGA>
          </HeaderGlobalBar>
        </Header>

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
