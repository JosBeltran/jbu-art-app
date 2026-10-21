// Marketplaces externos — preparación para integraciones futuras (Fase 2+).
// Ningún proveedor está conectado todavía: no hay OAuth ni sincronización automática.
// La plataforma JBU sigue siendo la fuente de verdad; cada obra original tiene cantidad 1,
// y una venta en cualquier canal deberá retirar la obra de los demás.

export const MARKETPLACE_CHANNELS = ['pinterest', 'mercadolibre', 'etsy', 'ebay', 'saatchi', 'facebook']

export const MARKETPLACE_STATUSES = ['draft', 'active', 'paused', 'sold', 'ended', 'error']

// Prioridad de implementación futura: 1. Pinterest Catalog, 2. Mercado Libre, 3. Etsy, 4. eBay.
export const MARKETPLACE_PRIORITY = ['pinterest', 'mercadolibre', 'etsy', 'ebay']

// Cada proveedor futuro se implementará como adaptador con esta forma:
//   { channel, createListing(artwork), pauseListing(listing), endListing(listing), syncStatus(listing) }
// Por ahora no existe ninguno: getProvider devuelve null de forma explícita.
export function getProvider(channel) {
  void channel
  return null
}
