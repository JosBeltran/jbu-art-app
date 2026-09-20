'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@supabase/supabase-js'
import { Tile, Tag } from '@carbon/react'
import { Trophy } from '@carbon/icons-react'

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
)

export default function TopBoosters({ artworkId }) {
  const [boosters, setBoosters] = useState([])
  const [loading, setLoading] = useState(true)

  useEffect(() => {
    async function fetchTopBoosters() {
      if (!artworkId) {
        console.log('⚠️ TopBoosters: artworkId aún no está definido.')
        return
      }

      console.log('🔍 TopBoosters: Consultando transacciones para artworkId:', artworkId)

      const { data, error } = await supabase
        .from('transactions')
        .select(`
          points_added,
          created_at,
          user_id,
          users ( display_name, email, user_level )
        `)
        .eq('artwork_id', artworkId)
        .eq('status', 'COMPLETED')
        .order('points_added', { ascending: false })
        .limit(5)

      if (error) {
        console.error('❌ Error consultando TopBoosters en Supabase:', error)
      } else {
        console.log('✅ TopBoosters data recibida:', data)
        setBoosters(data || [])
      }
      setLoading(false)
    }

    fetchTopBoosters()
  }, [artworkId])

  if (loading) {
    return (
      <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', marginBottom: '1rem' }}>
        <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', padding: '0.5rem 0' }}>
          Cargando impulsores comunitarios...
        </p>
      </Tile>
    )
  }

  return (
    <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '1rem' }}>
        <Trophy size={18} style={{ color: 'var(--cds-support-warning)' }} />
        <h5 className="cds--label" style={{ color: 'var(--cds-text-primary)', margin: 0 }}>
          Top Impulsores de esta Pieza
        </h5>
      </div>

      {boosters.length === 0 ? (
        <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontStyle: 'italic', margin: 0 }}>
          Sé el primer coleccionista en impulsar esta obra para figurar aquí.
        </p>
      ) : (
        <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
          {boosters.map((item, index) => {
            const userName =
              item.users?.display_name ||
              item.users?.email?.split('@')[0] ||
              'Mecenas Anónimo'
            const level = item.users?.user_level || 1

            // Definir color del Tag según el puesto del ranking
            const tagType = index === 0 ? 'magenta' : index === 1 ? 'cyan' : 'purple'

            return (
              <div
                key={index}
                style={{
                  display: 'flex',
                  justifyContent: 'space-between',
                  alignItems: 'center',
                  padding: '0.5rem 0.75rem',
                  borderRadius: '4px',
                  backgroundColor: 'var(--cds-layer-02)',
                  border: '1px solid var(--cds-border-subtle01)'
                }}
              >
                <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                  <span
                    style={{
                      width: '1.25rem',
                      height: '1.25rem',
                      borderRadius: '50%',
                      display: 'flex',
                      alignItems: 'center',
                      justifyContent: 'center',
                      fontWeight: 'bold',
                      fontSize: '0.625rem',
                      backgroundColor: index === 0 ? 'var(--cds-support-warning)' : 'var(--cds-layer-accent-01)',
                      color: index === 0 ? '#000' : 'var(--cds-text-primary)'
                    }}
                  >
                    #{index + 1}
                  </span>
                  <div>
                    <span style={{ fontSize: '0.75rem', fontWeight: '600', color: 'var(--cds-text-primary)', display: 'block' }}>
                      {userName}
                    </span>
                    <span style={{ fontSize: '0.625rem', color: 'var(--cds-text-secondary)' }}>
                      Nivel {level} Curador
                    </span>
                  </div>
                </div>
                
                <Tag type={tagType} size="sm" style={{ fontFamily: 'monospace', margin: 0 }}>
                  +{item.points_added} pts
                </Tag>
              </div>
            )
          })}
        </div>
      )}
    </Tile>
  )
}