'use client'

import { Tile, Tag, ProgressBar } from '@carbon/react'
import { getTierProgress } from '@/lib/gamification'

export default function TierProgressBar({ impactScore = 0, calculatedPriceMxn, basePriceMxn }) {
  const { currentTier, nextTier, progressPercentage, pointsNeeded } = getTierProgress(impactScore)

  return (
    <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', marginBottom: '1rem' }}>
      {/* Header del Tier */}
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '1.25rem' }}>
        <div>
          <Tag type="purple" size="sm" style={{ marginBottom: '0.5rem' }}>
            Tier {currentTier.tier} • {currentTier.name}
          </Tag>
          <p style={{ fontSize: '1.25rem', fontWeight: 'bold', color: 'var(--cds-text-primary)', margin: 0 }}>
            Impact Score: <span style={{ color: 'var(--cds-support-warning)' }}>{impactScore.toLocaleString()}</span> IS
          </p>
        </div>
        <div style={{ textAlign: 'right' }}>
          <span className="cds--label" style={{ color: 'var(--cds-text-secondary)', display: 'block', marginBottom: '0.125rem' }}>Multiplicador</span>
          <span style={{ fontSize: '1rem', fontFamily: 'monospace', fontWeight: 'bold', color: 'var(--cds-support-success)' }}>{currentTier.multiplier}x</span>
        </div>
      </div>

      {/* Barra de Progreso de Carbon */}
      <div style={{ marginBottom: '1.25rem' }}>
        <ProgressBar
          value={progressPercentage}
          max={100}
          label="Progreso de Tier"
          hideLabel={true}
          status="active"
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: '0.75rem', color: 'var(--cds-text-secondary)', fontFamily: 'monospace', marginTop: '0.5rem' }}>
          <span>{impactScore} pts</span>
          {nextTier ? (
            <span>Faltan {pointsNeeded.toLocaleString()} pts para Tier {nextTier.tier} ({nextTier.name})</span>
          ) : (
            <span style={{ color: 'var(--cds-support-warning)', fontWeight: '600' }}>¡Nivel Máximo Alcanzado!</span>
          )}
        </div>
      </div>

      {/* Revalorización de Precio */}
      <div style={{ paddingTop: '0.75rem', borderTop: '1px solid var(--cds-border-subtle01)', display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: '0.75rem' }}>
        <span style={{ color: 'var(--cds-text-secondary)' }}>Precio Base Original: ${basePriceMxn?.toLocaleString()} MXN</span>
        <span style={{ fontWeight: '600', color: 'var(--cds-support-success)' }}>
          Precio Sugerido Actual: ${calculatedPriceMxn?.toLocaleString()} MXN
        </span>
      </div>
    </Tile>
  )
}