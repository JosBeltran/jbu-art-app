'use client'

import { useState } from 'react'
import { supabase } from '@/lib/supabaseClient'

export default function ArtworkEngagement({ artworkId, initialMetrics }) {
  const [likes, setLikes] = useState(initialMetrics?.likes_count || 0)
  const [impactScore, setImpactScore] = useState(initialMetrics?.impact_score || 0)
  const [hasLiked, setHasLiked] = useState(false)
  const [loading, setLoading] = useState(false)

  // Determinar el Tier del Coleccionista según el Impact Score
  const getCollectorTier = (score) => {
    if (score >= 500) return { name: 'Tier 3 • Genesis Collector', color: 'bg-purple-100 text-purple-800 border-purple-200' }
    if (score >= 100) return { name: 'Tier 2 • Active Supporter', color: 'bg-indigo-100 text-indigo-800 border-indigo-200' }
    return { name: 'Tier 1 • Discovery Phase', color: 'bg-gray-100 text-gray-700 border-gray-200' }
  }

  const tier = getCollectorTier(impactScore)

  const handleLike = async () => {
    if (hasLiked || loading) return
    setLoading(true)

    // Actualización optimista en el cliente
    setLikes(prev => prev + 1)
    setImpactScore(prev => prev + 10)
    setHasLiked(true)

    try {
      // Llamar a la función atómica en Supabase
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
    } finally {
      setLoading(false)
    }
  }

  return (
    <div className="p-5 border border-indigo-100 bg-gradient-to-br from-indigo-50/60 to-white rounded-xl space-y-4 shadow-sm">
      <div className="flex items-center justify-between">
        <div>
          <span className="text-[10px] font-bold tracking-widest text-indigo-600 uppercase block">
            ⚡ METRICAS DE IMPACTO
          </span>
          <h4 className="text-lg font-black text-gray-900 mt-0.5">
            {impactScore} <span className="text-xs font-normal text-gray-500">puntos acumulados</span>
          </h4>
        </div>
        <span className={`text-[11px] font-bold px-2.5 py-1 rounded-full border ${tier.color}`}>
          {tier.name}
        </span>
      </div>

      <div className="flex items-center gap-3 pt-2">
        {/* Botón de Like */}
        <button
          onClick={handleLike}
          disabled={hasLiked || loading}
          className={`flex-1 flex items-center justify-center gap-2 py-2.5 px-4 rounded-lg font-bold text-xs transition duration-200 border ${
            hasLiked 
              ? 'bg-rose-50 text-rose-600 border-rose-200 cursor-default' 
              : 'bg-white text-gray-800 border-gray-300 hover:border-rose-300 hover:text-rose-600 shadow-sm'
          }`}
        >
          <span className={hasLiked ? 'text-rose-500' : 'text-gray-400'}>
            {hasLiked ? '❤️' : '🤍'}
          </span>
          <span>{hasLiked ? '¡Registrado!' : 'Aportar Like (+10 Pts)'}</span>
          <span className="bg-gray-100 text-gray-600 px-2 py-0.5 rounded-full text-[10px] font-bold ml-1">
            {likes}
          </span>
        </button>
      </div>
    </div>
  )
}