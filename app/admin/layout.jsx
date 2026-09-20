'use client'

import { useState, useEffect } from 'react'
import Link from 'next/link'
import { usePathname } from 'next/navigation'
import { supabase } from '@/lib/supabaseClient'
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
  Folder, 
  Document, 
  Gift, 
  DeliveryTruck, 
  UserMultiple, 
  Logout, 
  Home,
  Dashboard
} from '@carbon/icons-react'

export default function AdminLayout({ children }) {
  const [isAdmin, setIsAdmin] = useState(false)
  const [loading, setLoading] = useState(true)
  const pathname = usePathname()

  useEffect(() => {
    async function checkAdminRole() {
      const { data: { user } } = await supabase.auth.getUser()
      if (!user) {
        window.location.href = '/login'
        return
      }

      // Verificación estricta de rol de administrador
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
      const isUserAdmin = roleUpper === 'ADMIN' || roleUpper === 'ADMINISTRADOR' || user.email === 'josue.beltran.u@gmail.com'

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

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <InlineLoading description="Verificando credenciales de administración..." />
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', flexDirection: 'column' }}>
      {/* HEADER DE BACKOFFICE CARBON */}
      <Header aria-label="JBU Studio Backoffice" className="cds--header cds--header--g100">
        <HeaderName href="/admin" prefix="JBU">
          Studio Backoffice
        </HeaderName>
        <HeaderGlobalBar>
          <HeaderGlobalAction aria-label="Ir al Sitio Público" onClick={() => window.location.href = '/'}>
            <Home size={20} />
          </HeaderGlobalAction>
          <HeaderGlobalAction aria-label="Cerrar Sesión" onClick={handleLogout}>
            <Logout size={20} />
          </HeaderGlobalAction>
        </HeaderGlobalBar>
      </Header>

      <div style={{ display: 'flex', flex: 1, marginTop: '3rem' }}>
        {/* SIDENAV ADMINISTRATIVO */}
        <SideNav aria-label="Menú de Administración" expanded={true} isRail={false}>
          <SideNavItems>
            <SideNavLink 
              renderIcon={Folder} 
              href="/admin/artworks"
              isActive={pathname.startsWith('/admin/artworks')}
            >
              Inventario de Obras
            </SideNavLink>
            <SideNavLink 
              renderIcon={DeliveryTruck} 
              href="/admin/orders"
              isActive={pathname.startsWith('/admin/orders')}
            >
              Órdenes y Envíos
            </SideNavLink>
            <SideNavLink 
              renderIcon={Document} 
              href="/admin/certificates"
              isActive={pathname.startsWith('/admin/certificates')}
            >
              Certificados
            </SideNavLink>
            <SideNavLink 
              renderIcon={Gift} 
              href="/admin/claims"
              isActive={pathname.startsWith('/admin/claims')}
            >
              Lotes / Claims
            </SideNavLink>
            <SideNavDivider />
            <SideNavLink 
              renderIcon={UserMultiple} 
              href="/admin/users"
              isActive={pathname.startsWith('/admin/users')}
            >
              Directorio Usuarios
            </SideNavLink>
          </SideNavItems>
        </SideNav>

        {/* CONTENIDO PRINCIPAL DEL ADMIN */}
        <main style={{ flex: 1, padding: '2rem', backgroundColor: 'var(--cds-background)', overflowY: 'auto' }}>
          {children}
        </main>
      </div>
    </div>
  )
}