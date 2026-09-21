'use client'

import { usePathname } from 'next/navigation'
import { Theme } from "@carbon/react";
import { CartProvider } from '@/context/CartContext';
import Navbar from "@/components/Navbar";

export default function ClientLayout({ children }) {
  const pathname = usePathname();
  const isAuthPage = pathname === '/login' || pathname === '/signup';
  const isAdminPage = pathname.startsWith('/admin');
  const isGalleryHome = pathname === '/' || pathname === '/landing';

  return (
    // Cambiamos a 'g100' si toda tu galería usa el tema oscuro de Carbon, 
    // o mantenlo en 'g10' si prefieres el fondo claro para el público general.
    <Theme theme="g10" className="min-h-screen flex flex-col" style={{ backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)' }}>
      <CartProvider>
        {!isAuthPage && !isAdminPage && !isGalleryHome && <Navbar />}
        
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