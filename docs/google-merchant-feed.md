# Feed de Google Merchant Center

## URL del feed

`https://www.josuebeltranuresti.com/google-merchant.xml`

RSS 2.0 con namespace `xmlns:g="http://base.google.com/ns/1.0"`, UTF-8,
`Content-Type: application/xml; charset=utf-8`, público y sin autenticación.
Se genera dinámicamente en cada ventana de revalidación (1 h); no existe
ningún archivo XML físico ni catálogo paralelo.

## Elegibilidad (misma fuente que el catálogo público)

1. `getArtworks()` — status `AVAILABLE`/`OWNED` vía vista
   `artworks_discoverable` (respaldo: tabla `artworks`).
2. Serie activa: `isHomeEligible` (homeSeries) — Series próximas sin lanzar,
   archivadas o no verificables excluyen la obra.
3. Comprable con precio visible: `getArtworkCommercePresentation`
   (artworkCommerce) — disponibilidad `AVAILABLE`, modo `SHOW_PRICE` y
   precio > 0. `CONTACT_FOR_PRICE` y vendidas nunca entran.
4. Imagen principal pública (`primary_image_url`, absoluta HTTPS).
5. SKU presente (la ficha pública es `/artwork/[sku]`).

Ante un fallo de lectura el feed se publica vacío antes que con un precio
o estado incorrecto.

## Mapeo de atributos

| Google Merchant | Origen |
| --- | --- |
| `g:id` | `sku` → `code` → `id` (UUID) |
| `g:title` | `title_en` → `title` |
| `g:description` | `description_en` → `description` → síntesis de título, serie, año, medio, técnica, dimensiones |
| `g:link` | `SITE_URL` + `/artwork/[sku]` |
| `g:image_link` | `primary_image_url` (absoluta HTTPS) |
| `g:additional_image_link` | `secondary_images` + filas imagen de `artwork_images` (sin duplicar la principal, sin videos) |
| `g:availability` | `in_stock` (las no disponibles se excluyen) |
| `g:price` | `calculated_price_mxn` → `base_price_mxn`, formato `14900.00 MXN` |
| `g:condition` | `new` |
| `g:brand` | `JBU` |
| `g:identifier_exists` | `no` (sin GTIN/MPN fabricados) |
| `g:product_type` | `Art > Original Art > [medium_en → medium]` |
| `g:custom_label_0` | título de la Serie (si existe) |
| `g:custom_label_1` | `Original Artwork` |
| `g:google_product_category` | omitido: no se adivina un ID de taxonomía |

## Admin

`Admin → Google Merchant` (`/admin/merchant`): URL del feed con copiar/abrir
y diagnóstico en vivo (elegibles, excluidos y motivo) calculado con las
mismas reglas compartidas. No edita nada.

## Archivos

- `lib/googleMerchant.js` — reglas puras, mapeo y generación XML.
- `lib/googleMerchant.data.js` — lectura pública servidor (obras + Series + imágenes).
- `lib/googleMerchant.test.js` — pruebas de elegibilidad, mapeo y XML.
- `app/google-merchant.xml/route.js` — route handler público (revalidate 3600).
- `app/admin/merchant/page.jsx` + entrada en `app/admin/layout.jsx`.

Sin migración SQL: solo lee tablas existentes. Sin cambios de diseño,
catálogo, ficha, checkout, subastas, ofertas ni certificados.
