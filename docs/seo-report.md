# SEO — informe y cambios (oct 2026)

## Problemas encontrados
- Sin robots.txt ni sitemap.xml.
- Título/descr. global obsoletos ("Galería & Certificados").
- Fichas de obra: título "| Estudio JBU", descripción sin técnica/serie, sin JSON-LD, obras ocultas indexables.
- Catálogo sin canonical; H1 genérico "Obras".
- "Cómo funciona" sin metadatos propios.
- Login, registro, carrito, checkout, órdenes, reclamaciones y verificación sin noindex.
- Series: no tienen página propia (son un filtro `/catalog?series=`), por lo que no pueden tener metadatos/canonical propios.
- Idiomas: ES/EN comparten la misma URL y cambian en el navegador; hreflang no aplica.

## Cambios
- `lib/seo.js` (+ `lib/seo.test.js`): formato de título/descr. de obra, Person, VisualArtwork, BreadcrumbList y rutas privadas.
- `app/layout.tsx`: título por defecto + plantilla, descripción, siteName, locales.
- `app/page.tsx`: título "Contemporary Artist & Creative in Monterrey", descripción del brief, Person (jobTitle "Contemporary Artist and Creative") y WebSite.
- `app/landing/LandingClient.jsx`: H1 e introducción con "artista y creativo" (único H1, mismo estilo).
- `app/catalog/page.js` y `CatalogHero.jsx`: metadatos, canonical, H1 "Arte contemporáneo original / Original Contemporary Art".
- `app/artwork/[sku]/page.js`: título "[Obra] | Josué Beltrán Uresti", descripción con técnica, año, medidas y serie (sin precio), imagen propia, noindex si la obra o su Serie no es pública, JSON-LD VisualArtwork + Breadcrumb.
- `app/como-funciona/layout.js`: metadatos y canonical.
- `app/robots.ts`, `app/sitemap.ts`: solo URLs públicas (obras vía el mismo filtro del catálogo).
- `layout.js` con noindex en login, signup, reset-password, cart, checkout, orders, claim, verify, auth. Admin y cuenta bloqueados en robots.

## Acciones manuales
- Dar de alta el dominio www en Google Search Console y enviar `/sitemap.xml`.
- Confirmar en Vercel que el dominio sin www redirige (301) a www.
- Agregar perfiles reales (Instagram, etc.) a `sameAs` en `lib/seo.js`.
- Opcional: crear páginas reales por Serie (`/series/[slug]`) para poder indexarlas.
- Opcional: URLs separadas por idioma (`/en/...`) para usar hreflang.
