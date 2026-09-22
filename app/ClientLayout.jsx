'use client'

import { usePathname } from 'next/navigation'
import { Theme } from "@carbon/react";
import { CartProvider } from '@/context/CartContext';
import Navbar from "@/components/Navbar";
import { AppThemeProvider, useAppTheme } from '@/components/AppThemeProvider';

function ThemedShell({ children }) {
  const pathname = usePathname();
  const { dark } = useAppTheme();
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/reset-password';
  const isAdminPage = pathname.startsWith('/admin');
  const isGalleryHome = pathname === '/' || pathname === '/landing';
  // El certificado se muestra limpio, sin navegación global (solo sus propias acciones).
  const isVerifyPage = pathname.startsWith('/verify');

  return (
    // El tema cambia entre 'g10' (claro) y 'g100' (oscuro) según la preferencia del usuario.
    <Theme theme={dark ? 'g100' : 'g10'} className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}>
      <CartProvider>
        {!isAuthPage && !isAdminPage && !isGalleryHome && !isVerifyPage && <Navbar />}

        {/* Contenedor principal optimizado con tokens de Carbon */}
        <main
          className="flex-1"
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--cds-background)'
          }}
        >
          {children}
        </main>
      </CartProvider>
    </Theme>
  )
}

export default function ClientLayout({ children }) {
  return (
    <AppThemeProvider>
      <ThemedShell>{children}</ThemedShell>
    </AppThemeProvider>
  )
}
