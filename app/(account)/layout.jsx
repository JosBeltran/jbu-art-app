'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
import { 
  Header, 
  HeaderName, 
  HeaderGlobalBar, 
  HeaderGlobalAction,
  SideNav, 
  SideNavItems, 
  SideNavLink, 
  SideNavDivider,
  InlineLoading,
  Button
} from '@carbon/react'
import { 
  User, 
  Image as ImageIcon, 
  ShoppingBag, 
  Home, 
  Logout, 
  Award,
  ArrowRight
} from '@carbon/icons-react'

export default function AccountLayout({ children }) {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    async function checkAuthAndProfile() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }
      setUser(user)

      // Cargar perfil y XP del coleccionista
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
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <InlineLoading description="Cargando espacio del coleccionista..." />
      </div>
    )
  }

  const userXp = profile?.user_xp || 0
  const { currentLevel } = getUserLevelInfo(userXp)
  const levelTitle = currentLevel?.name || 'Coleccionista'
  const displayName = profile?.full_name || profile?.display_name || user?.email

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER DE CUENTA CARBON */}
      <Header aria-label="JBU Collector Space" className="cds--header cds--header--g100">
        <HeaderName href="/profile" prefix="JBU">
          Espacio del Coleccionista
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction aria-label="Ir al Catálogo / Galería" onClick={() => window.location.href = '/catalog'}>
            <Home size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Cerrar Sesión" onClick={handleLogout}>
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <div style={{ display: 'flex', flex: 1, marginTop: '3rem' }}>
        {/* SIDENAV DE NAVEGACIÓN PERSONAL */}
        <SideNav aria-label="Menú de Cuenta" expanded={true} isRail={false}>
          <SideNavItems>
            {/* Widget informativo del usuario en el menú */}
            <div style={{ padding: '1rem', borderBottom: '1px solid #393939', marginBottom: '0.5rem' }}>
              <p style={{ fontSize: '0.75rem', fontWeight: 'bold', color: '#f4f4f4', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                {displayName}
              </p>
              <p style={{ fontSize: '0.65rem', color: '#f1c232', marginTop: '0.25rem', textTransform: 'uppercase' }}>
                ⭐ Nivel {currentLevel?.level ?? 1} • {levelTitle}
              </p>
            </div>

            <SideNavLink 
              renderIcon={User} 
              href="/profile"
              isActive={pathname === '/profile'}
            >
              Mi Perfil & XP
            </SideNavLink>
            <SideNavLink 
              renderIcon={ImageIcon} 
              href="/collection"
              isActive={pathname === '/collection'}
            >
              Mi Colección Privada
            </SideNavLink>
            
            <SideNavDivider />

            <SideNavLink 
              renderIcon={Home} 
              href="/catalog"
            >
              Explorar Catálogo
            </SideNavLink>
          </SideNavItems>
        </SideNav>

        {/* CONTENIDO PRINCIPAL DE LA CUENTA */}
        <main style={{ flex: 1, padding: '2.5rem', backgroundColor: 'var(--cds-background)', overflowY: 'auto' }}>
          <div style={{ maxWidth: '1200px', margin: '0 auto' }}>
            {children}
          </div>
        </main>
      </div>
    </div>
  )
}