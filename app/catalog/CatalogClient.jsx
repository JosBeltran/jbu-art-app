'use client'

import { useState, useMemo } from 'react'
import Link from 'next/link'
import BuyButton from '@/components/BuyButton'

export default function CatalogClient({ initialArtworks }) {
  const [selectedSeries, setSelectedSeries] = useState('ALL')
  const [statusFilter, setStatusFilter] = useState('ALL')

  // Obtener la lista única de colecciones/series dinámicamente
  const seriesList = useMemo(() => {
    const series = initialArtworks.map((art) => art.series).filter(Boolean)
    return ['ALL', ...Array.from(new Set(series))]
  }, [initialArtworks])

  // Filtrar obras según la selección del usuario
  const filteredArtworks = useMemo(() => {
    return initialArtworks.filter((art) => {
      const matchSeries = selectedSeries === 'ALL' || art.series === selectedSeries
      const matchStatus = 
        statusFilter === 'ALL' || 
        (statusFilter === 'AVAILABLE' && art.status === 'AVAILABLE') ||
        (statusFilter === 'SOLD' && art.status === 'SOLD')
      
      return matchSeries && matchStatus
    })
  }, [initialArtworks, selectedSeries, statusFilter])

  return (
    <section>
      {/* Barra de Filtros */}
      <div className="flex flex-col sm:flex-row gap-4 justify-between items-center mb-8 p-4 bg-gray-50 rounded-lg border border-gray-100">
        {/* Filtro por Colección */}
        <div className="flex flex-wrap items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">Colección:</span>
          {seriesList.map((series) => (
            <button
              key={series}
              onClick={() => setSelectedSeries(series)}
              className={`px-3 py-1.5 rounded-full text-xs font-medium transition ${
                selectedSeries === series
                  ? 'bg-black text-white'
                  : 'bg-white text-gray-700 hover:bg-gray-200 border border-gray-200'
              }`}
            >
              {series === 'ALL' ? 'Todas' : series}
            </button>
          ))}
        </div>

        {/* Filtro por Disponibilidad */}
        <div className="flex items-center gap-2">
          <span className="text-xs font-semibold text-gray-500 uppercase tracking-wider mr-2">Estado:</span>
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="text-xs border border-gray-300 rounded-md p-2 bg-white font-medium focus:outline-none focus:ring-1 focus:ring-black"
          >
            <option value="ALL">Todas las obras</option>
            <option value="AVAILABLE">Solo Disponibles</option>
            <option value="SOLD">Vendidas / Colección Privada</option>
          </select>
        </div>
      </div>

      {/* Grid de Obras */}
      {filteredArtworks.length === 0 ? (
        <div className="text-center py-16 border border-dashed rounded-lg">
          <p className="text-gray-500 font-medium">No se encontraron obras con los filtros seleccionados.</p>
        </div>
      ) : (
        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-8">
          {filteredArtworks.map((art) => (
            <div 
              key={art.id} 
              className="group border border-gray-100 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition duration-200 flex flex-col"
            >
              <div className="relative aspect-square w-full bg-gray-100 overflow-hidden">
              <Link href={`/artwork/${art.sku}`} className="group border border-gray-100 rounded-lg overflow-hidden bg-white shadow-sm hover:shadow-md transition">
  { <img 
  src={art.primary_image_url.startsWith('/') ? art.primary_image_url : `/${art.primary_image_url}`} 
  alt={art.title}
  className="object-cover w-full h-full group-hover:scale-105 transition duration-300"
/> }
</Link>
              </div>

              <div className="p-5 flex-1 flex flex-col justify-between">
                <div>
                  <div className="flex justify-between items-start mb-2">
                    <span className="text-xs font-bold text-gray-400 tracking-wider uppercase">
                      {art.series}
                    </span>
                    <span className={`px-2 py-0.5 text-[10px] font-bold rounded tracking-wide ${
                      art.status === 'AVAILABLE' ? 'bg-emerald-50 text-emerald-700 border border-emerald-200' : 'bg-gray-100 text-gray-500'
                    }`}>
                      {art.status === 'AVAILABLE' ? 'DISPONIBLE' : 'VENDIDA'}
                    </span>
                  </div>

                  <h3 className="text-lg font-bold text-gray-900 mb-1">{art.title}</h3>
                  <p className="text-xs text-gray-500">{art.medium} • {art.dimensions}</p>
                </div>

                <div className="mt-6 pt-4 border-t border-gray-100 flex justify-between items-center">
                  <div>
                    <span className="block text-[10px] uppercase tracking-wider text-gray-400 font-medium">Inversión</span>
                    <span className="text-base font-bold text-gray-900">
                      ${art.calculated_price_mxn?.toLocaleString()} MXN
                    </span>
                  </div>

                  {art.status === 'AVAILABLE' && art.stripe_url && (
                    <a 
                      href={art.stripe_url} 
                      target="_blank" 
                      rel="noreferrer" 
                      className="bg-black text-white px-4 py-2 text-xs font-semibold rounded hover:bg-gray-800 transition"
                    >
                      Adquirir
                    </a>
                  )}
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}