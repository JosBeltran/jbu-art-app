'use client'

import { useState, useEffect, useRef, useCallback } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
import Link from 'next/link'
import { useI18n } from '@/components/I18nProvider'

export default function UserNavbarDropdown({ initialUser }) {
  const { t } = useI18n()
  const [isOpen, setIsOpen] = useState(false)
  const [profile, setProfile] = useState(null)
  const [user, setUser] = useState(initialUser)
  const dropdownRef = useRef(null)

  // Carga de perfil independiente para evitar re-ejecuciones innecesarias
  const fetchUserProfile = useCallback(async (userId) => {
    if (!userId) return null
    try {
      const { data: profileData } = await supabase
        .from('users')
        .select('user_xp, user_level, display_name, role')
        .eq('id', userId)
        .maybeSingle()
      return profileData
    } catch (error) {
      console.error('Error al cargar perfil de usuario:', error)
      return null
    }
  }, [])

  // Suscripción a Auth y sincronización de datos de perfil
  useEffect(() => {
    let isMounted = true

    if (user?.id) {
      fetchUserProfile(user.id).then((profileData) => {
        if (isMounted && profileData) {
          setProfile(profileData)
        }
      })
    }

    const { data: authListener } = supabase.auth.onAuthStateChange(async (event, session) => {
      const currentUser = session?.user || null
      if (isMounted) {
        setUser(currentUser)
      }

      if (currentUser) {
        const profileData = await fetchUserProfile(currentUser.id)
        if (isMounted && profileData) {
          setProfile(profileData)
        }
      } else if (isMounted) {
        setProfile(null)
      }
    })

    return () => {
      isMounted = false
      authListener?.subscription?.unsubscribe()
    }
  }, [user?.id, fetchUserProfile])

  // Cerrar dropdown al hacer clic fuera del componente
  useEffect(() => {
    function handleClickOutside(e) {
      if (dropdownRef.current && !dropdownRef.current.contains(e.target)) {
        setIsOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  const handleLogout = async () => {
    try {
      await supabase.auth.signOut()
    } catch (error) {
      console.error('Error al cerrar sesión:', error)
    } finally {
      setUser(null)
      setProfile(null)
      setIsOpen(false)
      window.location.href = '/'
    }
  }

  if (!user) {
    return (
      <Link 
        href="/login" 
        className="text-xs font-mono text-[#f4f4f4] hover:text-[#161616] hover:bg-[#f1c232] px-4 py-2.5 transition uppercase tracking-wider border border-[#393939] bg-[#262626]"
      >
        {t('Ingresar', 'Sign in')}
      </Link>
    )
  }

  const { currentLevel, progressPercentage } = getUserLevelInfo(profile?.user_xp || 0)
  const displayName = profile?.display_name || user.user_metadata?.full_name || user.email?.split('@')[0]
  
  // Validación de rol de administrador
  const roleUpper = profile?.role ? String(profile.role).toUpperCase() : ''
  const isAdmin = roleUpper === 'ADMIN' || roleUpper === 'ADMINISTRADOR' || user?.email === 'josue.beltran.u@gmail.com'
  const userRole = isAdmin ? t('ADMINISTRADOR', 'ADMIN') : (profile?.role || t('COLECCIONISTA', 'COLLECTOR'))

  const userInitials = displayName ? displayName.split(' ').map((n) => n[0]).join('').substring(0, 2).toUpperCase() : 'JB'

  return (
    <div className="relative inline-block text-left font-sans" ref={dropdownRef}>
      {/* BOTÓN DEL NAVBAR (AVATAR + NOMBRE) */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="flex items-center space-x-3 px-3 py-2 bg-[#262626] border border-[#393939] hover:border-[#8d8d8d] text-left transition focus:outline-none focus:ring-1 focus:ring-white"
      >
        <div className={`w-6 h-6 flex items-center justify-center font-mono text-xs font-bold ${
          isAdmin 
            ? 'bg-[#f1c232]/10 text-[#f1c232] border border-[#f1c232]/30' 
            : 'bg-[#24a148]/10 text-[#24a148] border border-[#24a148]/30'
        }`}>
          {userInitials}
        </div>
        <span className="text-xs font-mono text-[#f4f4f4] max-w-[120px] truncate">{displayName}</span>
        <svg
          className={`w-3.5 h-3.5 text-[#8d8d8d] transition-transform duration-200 ${isOpen ? 'rotate-180' : ''}`}
          fill="none"
          viewBox="0 0 24 24"
          stroke="currentColor"
        >
          <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M19 9l-7 7-7-7" />
        </svg>
      </button>

      {/* DROPDOWN DESPLEGABLE ESTILO CARBON */}
      {isOpen && (
        <div className="absolute right-0 mt-1 w-80 bg-[#161616] border border-[#393939] shadow-2xl p-4 space-y-4 z-50 text-xs">
          
          {/* 1. SECCIÓN INFORMACIÓN DE USUARIO Y ROL */}
          <div className="pb-3 border-b border-[#393939]">
            <p className="font-mono text-[#f4f4f4] font-semibold truncate">{displayName}</p>
            <p className="font-mono text-[10px] text-[#8d8d8d] truncate mt-0.5">{user.email}</p>
            
            <div className="flex justify-between items-center mt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#8d8d8d]">
                {t('Rol / Nivel', 'Role / Level')}
              </span>
              <span className={`text-[10px] font-mono font-bold px-2 py-0.5 uppercase tracking-wider ${
                isAdmin 
                  ? 'bg-[#f1c232]/10 text-[#f1c232] border border-[#f1c232]/30' 
                  : 'bg-[#24a148]/10 text-[#24a148] border border-[#24a148]/30'
              }`}>
                {userRole}
              </span>
            </div>
          </div>

          {/* 2. WIDGET GAMIFICADO DE XP */}
          <Link 
            href="/profile" 
            onClick={() => setIsOpen(false)}
            className="block p-3 bg-[#262626] border border-[#393939] hover:border-[#f1c232] transition space-y-2 group"
          >
            <div className="flex justify-between items-center">
              <div>
                <span className="text-[10px] font-mono uppercase font-bold text-[#f1c232] tracking-wider block">
                  {t('Nivel', 'Level')} {currentLevel?.level ?? 1} • {currentLevel?.name || currentLevel?.title || t('Coleccionista', 'Collector')}
                </span>
                <span className="text-xs font-mono text-[#8d8d8d] group-hover:text-[#f4f4f4] transition">
                  {t('Ver Perfil & XP →', 'View Profile & XP →')}
                </span>
              </div>
              <span className="font-mono text-xs font-bold text-[#f1c232] bg-[#f1c232]/10 px-2 py-1 border border-[#f1c232]/20">
                {(profile?.user_xp || 0).toLocaleString()} XP
              </span>
            </div>

            {/* Micro Barra de Progreso */}
            <div className="w-full h-1 bg-[#393939] overflow-hidden">
              <div 
                className="h-full bg-[#f1c232] transition-all duration-500" 
                style={{ width: `${progressPercentage}%` }} 
              />
            </div>
          </Link>

          {/* 3. COLECCIÓN PRIVADA */}
          <div className="space-y-1">
            <span className="text-[10px] font-mono uppercase tracking-widest text-[#8d8d8d] block px-1">
              {t('Colección Privada', 'Private Collection')}
            </span>
            <Link
              href="/profile?tab=collection"
              onClick={() => setIsOpen(false)}
              className="flex items-center space-x-3 px-3 py-2 font-mono text-[#f4f4f4] hover:bg-[#262626] transition border border-transparent hover:border-[#393939]"
            >
              <span>🖼️</span>
              <span>{t('Mi Colección Privada', 'My Private Collection')}</span>
            </Link>
          </div>

          {/* 4. ESTUDIO / ADMINISTRACIÓN */}
          {isAdmin && (
            <div className="space-y-1 border-t border-[#393939] pt-3">
              <span className="text-[10px] font-mono uppercase tracking-widest text-[#f1c232] font-bold block px-1">
                {t('Estudio / Administración', 'Studio / Admin')}
              </span>

              <Link
                href="/admin/claims"
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-3 px-3 py-2 font-mono text-[#f1c232] hover:bg-[#262626] transition border border-transparent hover:border-[#393939]"
              >
                <span>🎁</span>
                <span>{t('Gestión de Lotes de Obras', 'Artwork Batches Management')}</span>
              </Link>

              <Link
                href="/admin/orders"
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-3 px-3 py-2 font-mono text-[#f4f4f4] hover:bg-[#262626] transition border border-transparent hover:border-[#393939]"
              >
                <span>🚚</span>
                <span>{t('Gestión de Órdenes y Envíos', 'Orders & Shipping Management')}</span>
              </Link>

              <Link
                href="/admin/certificates"
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-3 px-3 py-2 font-mono text-[#f4f4f4] hover:bg-[#262626] transition border border-transparent hover:border-[#393939]"
              >
                <span>📜</span>
                <span>{t('Aprobación de Certificados', 'Certificate Approval')}</span>
              </Link>

              <Link
                href="/admin/inventory"
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-3 px-3 py-2 font-mono text-[#f4f4f4] hover:bg-[#262626] transition border border-transparent hover:border-[#393939]"
              >
                <span>📁</span>
                <span>{t('Inventario de Obras', 'Artwork Inventory')}</span>
              </Link>

              <Link
                href="/admin/users"
                onClick={() => setIsOpen(false)}
                className="flex items-center space-x-3 px-3 py-2 font-mono text-[#f4f4f4] hover:bg-[#262626] transition border border-transparent hover:border-[#393939]"
              >
                <span>👥</span>
                <span>{t('Directorio de Usuarios', 'User Directory')}</span>
              </Link>
            </div>
          )}

          {/* 5. CERRAR SESIÓN */}
          <div className="border-t border-[#393939] pt-3">
            <button
              onClick={handleLogout}
              className="w-full text-left flex items-center space-x-3 px-3 py-2 font-mono text-[#fa4d56] hover:bg-[#fa4d56]/10 transition border border-transparent hover:border-[#fa4d56]/30"
            >
              <span>🚪</span>
              <span>{t('Cerrar Sesión', 'Sign Out')}</span>
            </button>
          </div>

        </div>
      )}
    </div>
  )
}