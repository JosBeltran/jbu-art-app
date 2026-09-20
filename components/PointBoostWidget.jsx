'use client'

import { useState } from 'react'
import { Tile, Button } from '@carbon/react'
import { Rocket } from '@carbon/icons-react'

export default function PointBoostWidget({ artworkId, artworkSku, currentUserId }) {
  const [loading, setLoading] = useState(false)

  const handleBoost = async (pointsAmount, priceMxn, packageName) => {
    if (!currentUserId) {
      alert('Debes iniciar sesión para impulsar esta obra.')
      return
    }

    setLoading(true)
    try {
      const res = await fetch('/api/checkout/points', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          artworkId,
          artworkSku,
          userId: currentUserId,
          pointsAmount,
          priceMxn,
          packageName
        })
      })

      const data = await res.json()
      if (data.url) {
        window.location.href = data.url
      } else {
        alert('Error al iniciar la compra de puntos.')
      }
    } catch (err) {
      console.error(err)
      alert('Ocurrió un error al conectar con el checkout.')
    } finally {
      setLoading(false)
    }
  }

  return (
    <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', marginBottom: '1rem' }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.5rem' }}>
        <Rocket size={20} style={{ color: 'var(--cds-interactive-01)' }} />
        <h3 style={{ fontSize: '1rem', fontWeight: 'bold', color: 'var(--cds-text-primary)', margin: 0 }}>
          Impulsar e Incrementar Valor (IS)
        </h3>
      </div>
      
      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', marginBottom: '1rem' }}>
        Aporta capital comunitario para subir el Tier de la obra y ganar XP.
      </p>

      <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3, 1fr)', gap: '0.5rem' }}>
        <Button
          kind="secondary"
          size="sm"
          disabled={loading}
          onClick={() => handleBoost(500, 50, 'Impulso Bronce')}
          style={{ width: '100%', justifyContent: 'center', flexDirection: 'column', height: 'auto', padding: '0.5rem' }}
        >
          <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>+500 pts</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>$50 MXN</span>
        </Button>

        <Button
          kind="secondary"
          size="sm"
          disabled={loading}
          onClick={() => handleBoost(1200, 100, 'Impulso Plata')}
          style={{ width: '100%', justifyContent: 'center', flexDirection: 'column', height: 'auto', padding: '0.5rem' }}
        >
          <span style={{ fontWeight: 'bold', fontSize: '0.875rem', color: 'var(--cds-support-warning)' }}>+1,200 pts</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.8 }}>$100 MXN</span>
        </Button>

        <Button
          kind="primary"
          size="sm"
          disabled={loading}
          onClick={() => handleBoost(2500, 200, 'Impulso Oro')}
          style={{ width: '100%', justifyContent: 'center', flexDirection: 'column', height: 'auto', padding: '0.5rem' }}
        >
          <span style={{ fontWeight: 'bold', fontSize: '0.875rem' }}>+2,500 pts</span>
          <span style={{ fontSize: '0.75rem', opacity: 0.9 }}>$200 MXN</span>
        </Button>
      </div>
    </Tile>
  )
}