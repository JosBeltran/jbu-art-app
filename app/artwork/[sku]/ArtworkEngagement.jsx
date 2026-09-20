'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'
import { Tile, Button, Tag } from '@carbon/react'
import { Favorite, Lightning } from '@carbon/icons-react'
import { TIER_THRESHOLDS } from '@/lib/gamification'

export default function ArtworkEngagement({ artworkId, initialMetrics }) {
  const [likes, setLikes] = useState(initialMetrics?.likes_count || 0)
  const [impactScore, setImpactScore] = useState(initialMetrics?.impact_score || 0)
  const [hasLiked, setHasLiked] = useState(false)
  const [loading, setLoading] = useState(false)

  // Obtener el tier actual utilizando los umbrales centralizados de gamification.js
  const getCollectorTier = (score) => {
    let current = TIER_THRESHOLDS[0]
    for (let i = TIER_THRESHOLDS.length - 1; i >= 0; i--) {
      if (score >= TIER_THRESHOLDS[i].minScore) {
        current = TIER_THRESHOLDS[i]
        break
      }
    }
    
    // Asignar tipo de Tag de Carbon según el nivel de tier
    const types = ['cyan', 'purple', 'blue', 'magenta', 'green']
    return {
      name: `Tier ${current.tier} • ${current.name}`,
      type: types[current.tier] || 'purple'
    }
  }

  const tier = getCollectorTier(impactScore)

  const handleLike = async () => {
    if (hasLiked || loading) return
    setLoading(true)

    // Actualización optimista en el cliente (sumando 1 like y 10 puntos al impact score)
    setLikes(prev => prev + 1)
    setImpactScore(prev => prev + 10)
    setHasLiked(true)

    try {
      const { error } = await supabase.rpc('increment_like', {
        target_artwork_id: artworkId
      })

      if (error) {
        console.error('Error guardando el like:', error.message)
        // Revertir si falla
        setLikes(prev => prev - 1)
        setImpactScore(prev => prev - 10)
        setHasLiked(false)
      }
    } catch (err) {
      console.error('Error de red:', err)
      setLikes(prev => prev - 1)
      setImpactScore(prev => prev - 10)
      setHasLiked(false)
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'flex-start', justifyContent: 'space-between', marginBottom: '1rem' }}>
        <div>
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.375rem', marginBottom: '0.25rem' }}>
            <Lightning size={14} style={{ color: 'var(--cds-support-warning)' }} />
            <span className="cds--label" style={{ color: 'var(--cds-text-secondary)', letterSpacing: '0.5px' }}>
              MÉTRICAS DE IMPACTO
            </span>
          </div>
          <h4 style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--cds-text-primary)', margin: 0 }}>
            {impactScore.toLocaleString()} <span style={{ fontSize: '0.75rem', fontWeight: 'normal', color: 'var(--cds-text-secondary)' }}>puntos acumulados</span>
          </h4>
        </div>
        
        <Tag type={tier.type} size="sm" style={{ margin: 0 }}>
          {tier.name}
        </Tag>
      </div>

      <div style={{ display: 'flex', gap: '0.5rem', paddingTop: '0.5rem', borderTop: '1px solid var(--cds-border-subtle01)' }}>
        <Button
          kind={hasLiked ? 'tertiary' : 'secondary'}
          size="sm"
          onClick={handleLike}
          disabled={hasLiked || loading}
          renderIcon={Favorite}
          style={{ width: '100%', justifyContent: 'center' }}
        >
          {hasLiked ? `¡Registrado! (${likes})` : `Aportar Like (+10 Pts) • ${likes}`}
        </Button>
      </div>
    </Tile>
  )
}