'use client'

import { useState, useEffect } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { getUserLevelInfo } from '@/lib/userLevels'
import Link from 'next/link'
import { 
  Tile, 
  Button, 
  InlineLoading, 
  ProgressBar, 
  DataTable,
  Table,
  TableHead,
  TableRow,
  TableHeader,
  TableBody,
  TableCell 
} from '@carbon/react'
import { User, Image as ImageIcon, Package, Rocket, Launch, ArrowRight } from '@carbon/icons-react'

export default function ProfilePage() {
  const [user, setUser] = useState(null)
  const [profile, setProfile] = useState(null)
  const [transactions, setTransactions] = useState([])
  const [orders, setOrders] = useState([])
  const [loading, setLoading] = useState(true)

  // Estado para controlar la pestaña activa sin borrar secciones
  const [activeTab, setActiveTab] = useState('overview') // 'overview' | 'orders' | 'impulses'

  useEffect(() => {
    async function loadUserData() {
      // 1. Obtener usuario autenticado
      const { data: { user: authUser } } = await supabase.auth.getUser()

      if (!authUser) {
        setLoading(false)
        return
      }

      setUser(authUser)

      // 2. Obtener perfil del usuario desde 'profiles' (o fallback a 'users')
      let { data: profileData } = await supabase
        .from('profiles')
        .select('xp, full_name')
        .eq('id', authUser.id)
        .maybeSingle()

      // Fallback: Si no lo halla por ID, buscar por EMAIL
      if (!profileData) {
        const { data: profileByEmail } = await supabase
          .from('profiles')
          .select('xp, full_name')
          .ilike('email', authUser.email)
          .maybeSingle()

        profileData = profileByEmail
      }

      // Fallback si la info está en la tabla 'users'
      if (!profileData) {
        const { data: userData } = await supabase
          .from('users')
          .select('user_xp as xp, display_name')
          .eq('id', authUser.id)
          .maybeSingle()
        profileData = userData
      }

      if (profileData) setProfile(profileData)

      // 3. Obtener transacciones de Impulsos / Puntos
      const { data: txData } = await supabase
        .from('transactions')
        .select('id, points_added, amount_paid_mxn, package_name, created_at, artwork_id')
        .eq('user_id', authUser.id)
        .eq('status', 'COMPLETED')
        .order('created_at', { ascending: false })

      setTransactions(txData || [])

      // 4. Obtener Órdenes de Compras Físicas
      const { data: ordersData } = await supabase
        .from('orders')
        .select('id, total_amount_mxn, status, created_at')
        .eq('buyer_email', authUser.email)
        .order('created_at', { ascending: false })

      setOrders(ordersData || [])

      setLoading(false)
    }

    loadUserData()
  }, [])

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <InlineLoading description="Cargando perfil de coleccionista..." />
      </div>
    )
  }

  if (!user) {
    return (
      <div style={{ minHeight: '100vh', backgroundColor: 'var(--cds-background)', color: 'var(--cds-text-primary)', padding: '2rem', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '1rem', textAlign: 'center' }}>
        <h1 style={{ fontSize: '1.75rem', fontFamily: 'serif', fontWeight: 300, margin: 0 }}>Inicia Sesión</h1>
        <p style={{ fontSize: '0.8rem', color: 'var(--cds-text-secondary)', margin: 0 }}>Debes acceder a tu cuenta para ver tu nivel de XP e historial.</p>
        <Button as={Link} href="/login" kind="primary" size="md">
          Iniciar Sesión
        </Button>
      </div>
    )
  }

  const userXP = profile?.xp || profile?.user_xp || 0
  const { currentLevel, nextLevel, progressPercentage, xpNeeded } = getUserLevelInfo(userXP)

  return (
    <div style={{
      minHeight: '100vh',
      backgroundColor: 'var(--cds-background)',
      color: 'var(--cds-text-primary)',
      padding: '2.5rem 1.5rem',
      maxWidth: '56rem',
      margin: '0 auto',
      boxSizing: 'border-box',
      display: 'flex',
      flexDirection: 'column',
      gap: '2rem'
    }}>
      
      {/* HEADER DE USUARIO */}
      <Tile style={{ 
        padding: '2rem', 
        border: '1px solid var(--cds-border-subtle)', 
        borderRadius: '1rem', 
        backgroundColor: 'var(--cds-layer-01)', 
        display: 'flex', 
        flexDirection: 'row', 
        justifyContent: 'space-between', 
        alignItems: 'center', 
        flexWrap: 'wrap', 
        gap: '1.5rem' 
      }}>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
            <span style={{ width: '8px', height: '8px', borderRadius: '50%', backgroundColor: '#f1c21b', display: 'inline-block' }}></span>
            <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', textTransform: 'uppercase', letterSpacing: '0.1em', color: '#f1c21b' }}>
              Nivel {currentLevel.level} • {currentLevel.name || currentLevel.title}
            </span>
          </div>
          <h1 style={{ fontSize: '2rem', fontFamily: 'serif', fontWeight: 300, margin: 0, color: 'var(--cds-text-primary)' }}>
            {profile?.full_name || profile?.display_name || user.email?.split('@')[0]}
          </h1>
          <p style={{ fontSize: '0.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
            {user.email}
          </p>
        </div>

        <div style={{ backgroundColor: 'var(--cds-layer-02)', padding: '1.25rem', borderRadius: '0.75rem', border: '1px solid var(--cds-border-subtle)', minWidth: '180px', textAlign: 'right' }}>
          <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', display: 'block' }}>XP Acumulado</span>
          <span style={{ fontSize: '1.75rem', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', color: '#f1c21b' }}>
            {userXP.toLocaleString()} XP
          </span>
        </div>
      </Tile>

      {/* ACCESO DIRECTO A MI COLECCIÓN PRIVADA */}
      <Tile style={{ 
        padding: '1.25rem 1.5rem', 
        border: '1px solid rgba(241, 194, 27, 0.3)', 
        backgroundColor: 'rgba(241, 194, 27, 0.03)', 
        borderRadius: '1rem', 
        display: 'flex', 
        alignItems: 'center', 
        justifyContent: 'space-between', 
        flexWrap: 'wrap', 
        gap: '1rem' 
      }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '1rem' }}>
          <div style={{ padding: '0.75rem', backgroundColor: 'rgba(241, 194, 27, 0.1)', borderRadius: '0.5rem', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
            <ImageIcon size={24} style={{ fill: '#f1c21b' }} />
          </div>
          <div>
            <h3 style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)', margin: 0 }}>Ver mi Colección Privada</h3>
            <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', margin: '0.2rem 0 0 0' }}>Explora las obras de arte y certificados que posees en la galería dedicada.</p>
          </div>
        </div>
        <Button 
          as={Link}
          href="/collection" 
          kind="tertiary"
          size="sm"
          renderIcon={ArrowRight}
        >
          Ir a Mi Colección
        </Button>
      </Tile>

      {/* BARRA DE NAVEGACIÓN POR PESTAÑAS (TABS) */}
      <div style={{ display: 'flex', borderBottom: '1px solid var(--cds-border-subtle)', gap: '1.5rem', overflowX: 'auto' }}>
        <button
          onClick={() => setActiveTab('overview')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'overview' ? '2px solid #f1c21b' : '2px solid transparent',
            color: activeTab === 'overview' ? '#f1c21b' : 'var(--cds-text-secondary)',
            whiteSpace: 'nowrap',
            transition: 'color 0.2s'
          }}
        >
          🏆 Nivel & Progreso
        </button>

        <button
          onClick={() => setActiveTab('orders')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'orders' ? '2px solid #f1c21b' : '2px solid transparent',
            color: activeTab === 'orders' ? '#f1c21b' : 'var(--cds-text-secondary)',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'color 0.2s'
          }}
        >
          <Package size={16} /> Compras ({orders.length})
        </button>

        <button
          onClick={() => setActiveTab('impulses')}
          style={{
            background: 'none',
            border: 'none',
            padding: '0.75rem 0.5rem',
            fontSize: '0.875rem',
            fontWeight: 600,
            cursor: 'pointer',
            borderBottom: activeTab === 'impulses' ? '2px solid #f1c21b' : '2px solid transparent',
            color: activeTab === 'impulses' ? '#f1c21b' : 'var(--cds-text-secondary)',
            whiteSpace: 'nowrap',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
            transition: 'color 0.2s'
          }}
        >
          <Rocket size={16} /> Impulsos ({transactions.length})
        </button>
      </div>

      {/* PESTAÑA 1: PROGRESO Y GAMIFICACIÓN */}
      {activeTab === 'overview' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1.5rem' }}>
          <Tile style={{ padding: '1.5rem', border: '1px solid var(--cds-border-subtle)', borderRadius: '1rem', backgroundColor: 'var(--cds-layer-01)', display: 'flex', flexDirection: 'column', gap: '1rem' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.8rem' }}>
              <span style={{ fontWeight: 600, color: 'var(--cds-text-primary)' }}>Progreso de Nivel</span>
              <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)' }}>
                {nextLevel ? `Faltan ${xpNeeded} XP para Nivel ${nextLevel.level}` : '¡Rango Máximo!'}
              </span>
            </div>

            <div style={{ width: '100%', backgroundColor: 'var(--cds-layer-02)', borderRadius: '1rem', overflow: 'hidden', padding: '2px', border: '1px solid var(--cds-border-subtle)' }}>
              <div 
                style={{ 
                  height: '8px', 
                  backgroundColor: '#f1c21b', 
                  borderRadius: '1rem', 
                  width: `${progressPercentage}%`,
                  transition: 'width 0.5s ease'
                }} 
              />
            </div>
          </Tile>

          {/* Tarjetas de Resumen */}
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit, minmax(240px, 1fr))', gap: '1rem' }}>
            <div 
              onClick={() => setActiveTab('orders')}
              style={{ padding: '1.25rem', border: '1px solid var(--cds-border-subtle)', borderRadius: '0.75rem', backgroundColor: 'var(--cds-layer-01)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--cds-code-font-family, monospace)', textTransform: 'uppercase', color: 'var(--cds-text-secondary)', display: 'block' }}>Obras Adquiridas</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>{orders.length} pedidos</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#f1c21b', fontWeight: 600 }}>Ver lista &rarr;</span>
            </div>

            <div 
              onClick={() => setActiveTab('impulses')}
              style={{ padding: '1.25rem', border: '1px solid var(--cds-border-subtle)', borderRadius: '0.75rem', backgroundColor: 'var(--cds-layer-01)', cursor: 'pointer', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}
            >
              <div>
                <span style={{ fontSize: '0.65rem', fontFamily: 'var(--cds-code-font-family, monospace)', textTransform: 'uppercase', color: 'var(--cds-text-secondary)', display: 'block' }}>Impulsos Inyectados</span>
                <span style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--cds-text-primary)' }}>{transactions.length} patrocinios</span>
              </div>
              <span style={{ fontSize: '0.75rem', color: '#f1c21b', fontWeight: 600 }}>Ver lista &rarr;</span>
            </div>
          </div>
        </div>
      )}

      {/* PESTAÑA 2: COMPRAS DE OBRAS Y PEDIDOS */}
      {activeTab === 'orders' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            📦 Compras de Obras de Arte ({orders.length})
          </h2>

          {orders.length === 0 ? (
            <Tile style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
              <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
                No tienes adquisiciones registradas.
              </p>
            </Tile>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {orders.map((ord) => (
                <div key={ord.id} style={{ padding: '1rem', border: '1px solid var(--cds-border-subtle)', borderRadius: '0.75rem', backgroundColor: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-primary)' }}>
                      Orden #{ord.id.slice(0, 8).toUpperCase()}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--cds-text-secondary)', marginTop: '0.2rem' }}>
                      {new Date(ord.created_at).toLocaleDateString()} • <span style={{ color: '#f1c21b' }}>{ord.status}</span>
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', color: '#f1c21b' }}>
                      +{Math.floor(ord.total_amount_mxn || 0)} XP
                    </span>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)' }}>
                      ${ord.total_amount_mxn?.toLocaleString('es-MX')} MXN
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* PESTAÑA 3: HISTORIAL DE IMPULSOS */}
      {activeTab === 'impulses' && (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '1rem' }}>
          <h2 style={{ fontSize: '1.25rem', fontWeight: 600, display: 'flex', alignItems: 'center', gap: '0.5rem', margin: 0 }}>
            🚀 Impulsos Realizados ({transactions.length})
          </h2>

          {transactions.length === 0 ? (
            <Tile style={{ padding: '2rem', textAlign: 'center', backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle)' }}>
              <p style={{ fontSize: '0.8rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)', margin: 0 }}>
                Aún no has impulsado ninguna obra.
              </p>
            </Tile>
          ) : (
            <div style={{ display: 'flex', flexDirection: 'column', gap: '0.75rem' }}>
              {transactions.map((tx) => (
                <div key={tx.id} style={{ padding: '1rem', border: '1px solid var(--cds-border-subtle)', borderRadius: '0.75rem', backgroundColor: 'var(--cds-layer-01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
                  <div>
                    <div style={{ fontSize: '0.875rem', fontWeight: 600, color: 'var(--cds-text-primary)' }}>
                      {tx.package_name || 'Paquete de Puntos'}
                    </div>
                    <div style={{ fontSize: '0.7rem', color: 'var(--cds-text-secondary)', marginTop: '0.2rem' }}>
                      {new Date(tx.created_at).toLocaleDateString()}
                    </div>
                  </div>
                  <div style={{ textAlign: 'right' }}>
                    <span style={{ display: 'block', fontFamily: 'var(--cds-code-font-family, monospace)', fontWeight: 'bold', color: '#42be65' }}>
                      +{tx.points_added} pts
                    </span>
                    <span style={{ fontSize: '0.7rem', fontFamily: 'var(--cds-code-font-family, monospace)', color: 'var(--cds-text-secondary)' }}>
                      ${tx.amount_paid_mxn} MXN
                    </span>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

    </div>
  )
}