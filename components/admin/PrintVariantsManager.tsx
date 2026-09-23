'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'

interface PrintVariant {
  id: string;
  artwork_id: string;
  size: string;
  finish: string;
  price: number;
  edition_type: 'OPEN' | 'LIMITED';
  max_edition_size?: number | null;
  is_active: boolean;
}

export default function PrintVariantsManager({ artworkId }: { artworkId: string }) {
  const { t, locale } = useI18n();

  // Opciones de acabado legibles vs. valores aceptados por el ENUM/DB
  const FINISH_OPTIONS = [
    { label: t('Papel Fine Art', 'Fine Art Paper'), value: 'FINE_ART' },
    { label: t('Lienzo / Canvas', 'Canvas'), value: 'CANVAS' },
    { label: t('Brillante / Gloss', 'Glossy'), value: 'GLOSS' },
    { label: t('Mate / Matte', 'Matte'), value: 'MATTE' },
    { label: t('Resina / Epoxy', 'Resin / Epoxy'), value: 'RESIN' },
  ];

  const [variants, setVariants] = useState<PrintVariant[]>([]);
  const [loading, setLoading] = useState(true);

  // Campos del formulario
  const [size, setSize] = useState('');
  const [finish, setFinish] = useState('FINE_ART'); // Valor inicial alineado al ENUM
  const [price, setPrice] = useState('');
  const [editionType, setEditionType] = useState<'OPEN' | 'LIMITED'>('OPEN');
  const [maxEditionSize, setMaxEditionSize] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const fetchVariants = useCallback(async () => {
    setLoading(true);
    const { data, error } = await supabase
      .from('artwork_prints')
      .select('*')
      .eq('artwork_id', artworkId)
      .order('price', { ascending: true });

    if (!error && data) {
      setVariants(data);
    }
    setLoading(false);
  }, [artworkId]);

  useEffect(() => {
    if (artworkId) fetchVariants();
  }, [artworkId, fetchVariants]);

  const handleAddVariant = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!size || !price) return;

    setSubmitting(true);
    
    // Inserción con valores sanitizados
    const { error } = await supabase.from('artwork_prints').insert([
      {
        artwork_id: artworkId,
        size,
        finish, // Envió directo del código ENUM ('FINE_ART', etc.)
        price: parseFloat(price),
        edition_type: editionType,
        max_edition_size: editionType === 'LIMITED' && maxEditionSize ? parseInt(maxEditionSize, 10) : null,
        is_active: true,
      },
    ]);

    if (!error) {
      setSize('');
      setPrice('');
      setEditionType('OPEN');
      setMaxEditionSize('');
      fetchVariants();
    } else {
      alert(t('Error al agregar variante: ', 'Error adding variant: ') + error.message);
    }
    setSubmitting(false);
  };

  const handleDeleteVariant = async (id: string) => {
    if (!confirm(t('¿Seguro que deseas eliminar esta opción de print?', 'Are you sure you want to delete this print option?'))) return;

    const { error } = await supabase.from('artwork_prints').delete().eq('id', id);
    if (!error) {
      fetchVariants();
    } else {
      alert(t('Error al eliminar: ', 'Error deleting: ') + error.message);
    }
  };

  // Helper para mostrar una etiqueta legible en la tabla
  const getFinishLabel = (val: string) => {
    const found = FINISH_OPTIONS.find((opt) => opt.value === val);
    return found ? found.label : val;
  };

  return (
    <div className="space-y-6">
      {/* Formulario para agregar print */}
      <form onSubmit={handleAddVariant} className="bg-violet-950 border border-violet-800 p-4 rounded-xl space-y-4">
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
          <div>
            <label className="block text-[10px] font-mono uppercase text-violet-400 mb-1">{t('Tamaño / Medidas', 'Size / Dimensions')}</label>
            <input
              type="text"
              placeholder={t('Ej: 30 x 40 cm', 'E.g: 30 x 40 cm')}
              value={size}
              onChange={(e) => setSize(e.target.value)}
              className="w-full bg-violet-900 border border-violet-800 rounded-lg p-2.5 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              required
            />
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-violet-400 mb-1">{t('Acabado / Material', 'Finish / Material')}</label>
            <select
              value={finish}
              onChange={(e) => setFinish(e.target.value)}
              className="w-full bg-violet-900 border border-violet-800 rounded-lg p-2.5 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
            >
              {FINISH_OPTIONS.map((opt) => (
                <option key={opt.value} value={opt.value}>
                  {opt.label}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className="block text-[10px] font-mono uppercase text-violet-400 mb-1">{t('Precio ($ MXN)', 'Price ($ MXN)')}</label>
            <input
              type="number"
              step="0.01"
              placeholder={t('Ej: 1200', 'E.g: 1200')}
              value={price}
              onChange={(e) => setPrice(e.target.value)}
              className="w-full bg-violet-900 border border-violet-800 rounded-lg p-2.5 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
              required
            />
          </div>
        </div>

        {/* Tipo de Edición */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 items-end pt-2 border-t border-violet-800">
          <div>
            <label className="block text-[10px] font-mono uppercase text-violet-400 mb-1">{t('Tipo de Edición', 'Edition Type')}</label>
            <select
              value={editionType}
              onChange={(e) => setEditionType(e.target.value as 'OPEN' | 'LIMITED')}
              className="w-full bg-violet-900 border border-violet-800 rounded-lg p-2.5 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
            >
              <option value="OPEN">{t('Abierta (Open Edition)', 'Open Edition')}</option>
              <option value="LIMITED">{t('Limitada / Numerada', 'Limited / Numbered')}</option>
            </select>
          </div>

          {editionType === 'LIMITED' ? (
            <div>
              <label className="block text-[10px] font-mono uppercase text-amber-400 mb-1">{t('Límite de Piezas (#)', 'Piece Limit (#)')}</label>
              <input
                type="number"
                placeholder={t('Ej: 25 o 50', 'E.g: 25 or 50')}
                value={maxEditionSize}
                onChange={(e) => setMaxEditionSize(e.target.value)}
                className="w-full bg-violet-900 border border-amber-500/50 rounded-lg p-2.5 text-xs font-mono text-white focus:border-amber-500 focus:outline-none"
                required
              />
            </div>
          ) : (
            <div className="text-[10px] font-mono text-violet-500 self-center">
              {t('* Sin límite de tiraje de impresiones.', '* No limit on print run.')}
            </div>
          )}

          <button
            type="submit"
            disabled={submitting}
            className="w-full py-2.5 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-violet-950 font-mono font-bold text-xs rounded-lg transition"
          >
            {submitting ? t('Añadiendo...', 'Adding...') : t('+ Agregar Opción de Print', '+ Add Print Option')}
          </button>
        </div>
      </form>

      {/* Lista de Variantes Existentes */}
      {loading ? (
        <p className="text-xs font-mono text-violet-500">{t('Cargando impresiones...', 'Loading prints...')}</p>
      ) : variants.length === 0 ? (
        <p className="text-xs font-mono text-violet-500 italic">{t('No hay variantes de print configuradas para esta obra.', 'No print variants configured for this artwork.')}</p>
      ) : (
        <div className="border border-violet-800 rounded-xl overflow-hidden">
          <table className="w-full text-left text-xs font-mono">
            <thead className="bg-violet-900 border-b border-violet-800 text-violet-400 uppercase text-[10px]">
              <tr>
                <th className="p-3">{t('Tamaño', 'Size')}</th>
                <th className="p-3">{t('Acabado', 'Finish')}</th>
                <th className="p-3">{t('Edición', 'Edition')}</th>
                <th className="p-3">{t('Precio', 'Price')}</th>
                <th className="p-3 text-right">{t('Acción', 'Action')}</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-violet-800">
              {variants.map((v) => (
                <tr key={v.id} className="hover:bg-violet-900/50">
                  <td className="p-3 text-white font-bold">{v.size}</td>
                  <td className="p-3 text-violet-400">{getFinishLabel(v.finish)}</td>
                  <td className="p-3">
                    {v.edition_type === 'LIMITED' ? (
                      <span className="inline-block px-2 py-0.5 bg-amber-500/10 text-amber-400 border border-amber-500/30 rounded text-[10px]">
                        {t('Limitada', 'Limited')} ({v.max_edition_size ?? t('N/D', 'N/A')} {t('uds.', 'units')})
                      </span>
                    ) : (
                      <span className="inline-block px-2 py-0.5 bg-violet-800 text-violet-400 rounded text-[10px]">
                        {t('Abierta', 'Open')}
                      </span>
                    )}
                  </td>
                  <td className="p-3 text-amber-400 font-bold">${v.price.toLocaleString(locale)} MXN</td>
                  <td className="p-3 text-right">
                    <button
                      onClick={() => handleDeleteVariant(v.id)}
                      className="text-red-400 hover:text-red-300 transition text-[10px] uppercase tracking-wider"
                    >
                      {t('Eliminar', 'Delete')}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}