'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { supabase } from '@/lib/supabaseClient'
import { useI18n } from '@/components/I18nProvider'
import { authHeaders } from '@/lib/authHeaders'

interface PrintVariant {
  id: string;
  artwork_id: string;
  size: string;
  finish: string;
  price: number;
  edition_type: 'OPEN' | 'LIMITED';
  max_edition_size?: number | null;
  is_active: boolean;
  print_gallery_image_id?: string | null;
  print_provenance_image_id?: string | null;
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
  const [imageOptions, setImageOptions] = useState<{key: string; url: string; label: string}[]>([]);
  const [newImageKey, setNewImageKey] = useState('');
  const [loading, setLoading] = useState(true);

  // Campos del formulario
  const [size, setSize] = useState('');
  const [finish, setFinish] = useState('FINE_ART'); // Valor inicial alineado al ENUM
  const [price, setPrice] = useState('');
  const [editionType, setEditionType] = useState<'OPEN' | 'LIMITED'>('OPEN');
  const [maxEditionSize, setMaxEditionSize] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const loadImages = useCallback(async () => {
    const gallery = await supabase.from('artwork_images')
      .select('id,image_url,media_type,display_order').eq('artwork_id', artworkId)
      .order('display_order', { ascending: true });
    const options = (gallery.data || []).filter(i => i.media_type !== 'video' && i.image_url)
      .map((i, index) => ({ key: 'gallery:' + i.id, url: i.image_url, label: t('Galería', 'Gallery') + ' ' + (index + 1) }));
    try {
      const response = await fetch('/api/admin/artworks/' + artworkId + '/provenance', { headers: { ...(await authHeaders()) } as Record<string, string> });
      if (response.ok) {
        const { events } = await response.json();
        for (const event of events || []) {
          // Only explicitly public provenance images may appear in public print cards.
          if (event.visibility !== 'PUBLIC') continue;
          for (const image of event.images || []) {
            if (image.image_url) options.push({ key: 'provenance:' + image.id, url: image.image_url, label: t('Procedencia', 'Provenance') + ': ' + (event.title || '') });
          }
        }
      }
    } catch (error) { console.error('Print image picker unavailable:', error); }
    setImageOptions(options);
  }, [artworkId, t]);

  const imageFields = (key: string) => {
    const [source, id] = String(key || '').split(':');
    return { print_gallery_image_id: source === 'gallery' ? id : null,
      print_provenance_image_id: source === 'provenance' ? id : null };
  };
  const chosenKey = (v: PrintVariant) => v.print_gallery_image_id ? 'gallery:' + v.print_gallery_image_id :
    v.print_provenance_image_id ? 'provenance:' + v.print_provenance_image_id : '';
  const [savingImageId, setSavingImageId] = useState<string | null>(null);
  const updateImage = async (variant: PrintVariant, key: string) => {
    setSavingImageId(variant.id);
    const { error } = await supabase.from('artwork_prints').update(imageFields(key)).eq('id', variant.id);
    if (error) alert(t('No se pudo guardar la imagen: ', 'Could not save image: ') + error.message);
    else await fetchVariants();
    setSavingImageId(null);
  };

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
    if (artworkId) { fetchVariants(); void loadImages(); }
  }, [artworkId, fetchVariants, loadImages]);

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
        ...imageFields(newImageKey),
      },
    ]);

    if (!error) {
      setNewImageKey('');
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

        <div>
          <p className="text-xs mb-2 text-violet-300">{t('Imagen del print (opcional)', 'Print image (optional)')}</p>
          <div className="flex flex-wrap gap-2">
            <button type="button" aria-pressed={!newImageKey} onClick={() => setNewImageKey('')}
              className="border border-violet-600 rounded p-2 text-xs">{t('Automática', 'Automatic')}</button>
            {imageOptions.map(img => <button type="button" key={img.key} onClick={() => setNewImageKey(img.key)}
              aria-pressed={newImageKey === img.key}
              className={`border rounded p-1 ${newImageKey === img.key ? 'border-amber-400 ring-2 ring-amber-400' : 'border-violet-700'}`}
              title={img.label}>
              <img src={img.url} alt={img.label} width={70} height={70} style={{width:70,height:70,objectFit:'cover'}} />
            </button>)}
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
                <th className="p-3">{t('Imagen', 'Image')}</th>
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
                  <td className="p-3"><select aria-label={t('Imagen de esta variante', 'Image for this variant')} disabled={savingImageId === v.id} value={chosenKey(v)} onChange={(e) => void updateImage(v, e.target.value)} className="bg-violet-900 p-2 text-white max-w-36"><option value="">{t('Automática', 'Automatic')}</option>{imageOptions.map(img => <option key={img.key} value={img.key}>{img.label}</option>)}</select>{imageOptions.find(img => img.key === chosenKey(v)) && <img src={imageOptions.find(img => img.key === chosenKey(v))?.url} alt={v.size} width={64} height={64} style={{width:64,height:64,objectFit:'cover',marginTop:6}} />}</td>
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