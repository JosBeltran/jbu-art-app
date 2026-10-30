'use client'

import { usePathname } from 'next/navigation'
import { Theme } from "@carbon/react";
import { CartProvider } from '@/context/CartContext';
import Navbar from "@/components/Navbar";
import OAuthReturnHandler from '@/components/auth/OAuthReturnHandler';
import { AppThemeProvider, useAppTheme } from '@/components/AppThemeProvider';
import { I18nProvider } from '@/components/I18nProvider';
import { CurrencyProvider } from '@/components/CurrencyProvider';
import TidioChat from '@/components/chat/TidioChat';
import WelcomePromoClaimer from '@/components/promo/WelcomePromoClaimer';
import CookieConsent from '@/components/consent/CookieConsent';
import PublicBottomNav from '@/components/nav/PublicBottomNav';

function ThemedShell({ children }) {
  const pathname = usePathname();
  const { dark } = useAppTheme();
  const isAuthPage = pathname === '/login' || pathname === '/signup' || pathname === '/reset-password' || pathname === '/consent';
  const isAdminPage = pathname.startsWith('/admin');
  const isGalleryHome = pathname === '/' || pathname === '/landing';
  // El certificado se muestra limpio, sin navegación global (solo sus propias acciones).
  const isVerifyPage = pathname.startsWith('/verify');
  // El espacio del coleccionista tiene su propia cabecera y barra inferior.
  const isAccountPage = ['/profile', '/collection', '/offers','/notifications'].some((p) => pathname === p || pathname.startsWith(`${p}/`));
  const showNavbar = !isAuthPage && !isAdminPage && !isGalleryHome && !isVerifyPage && pathname!=='/notifications';
  const showPublicBottomNav = !isAdminPage && !isVerifyPage && !isAccountPage;

  return (
    // El tema cambia entre 'g10' (claro) y 'g100' (oscuro) según la preferencia del usuario.
    <Theme theme={dark ? 'g100' : 'g10'} className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}>
      <CookieConsent><CartProvider>
        {/* Termina el acceso con Google si el proveedor devuelve al usuario a otra pantalla. */}
        <OAuthReturnHandler />
        <WelcomePromoClaimer />

        {showNavbar && <Navbar />}

        {/* Contenedor principal optimizado con tokens de Carbon */}
        <main
          className={`flex-1 ${showNavbar && !isAccountPage ? 'jbu-below-header' : ''} ${showPublicBottomNav ? 'jbu-above-bottom-nav' : ''}`}
          style={{
            width: '100%',
            display: 'flex',
            flexDirection: 'column',
            backgroundColor: 'var(--cds-background)'
          }}
        >
          {children}
        </main>

        {showPublicBottomNav && <PublicBottomNav />}

        {/* Chat con el estudio (Tidio): se carga una sola vez y no aparece en /admin. */}
        <TidioChat />
      </CartProvider></CookieConsent>
    </Theme>
  )
}

export default function ClientLayout({ children }) {
  return (
    <I18nProvider>
      <CurrencyProvider>
        <AppThemeProvider>
          <ThemedShell>{children}</ThemedShell>
        </AppThemeProvider>
      </CurrencyProvider>
    </I18nProvider>
  )
}
