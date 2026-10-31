# Compartir obras — previews editoriales globales

## Estado
Implementado en rama aislada `review/editorial-social-sharing`, desde main `0184aabc`. Main y producción no modificados. No se ha aplicado SQL.

## Análisis previo
ArtworkShare ya usaba navigator.share y Modal Carbon con Pinterest/WhatsApp/Facebook/X/copiar. Se conserva el botón en las dos posiciones existentes y el menú abre primero; compartir nativo queda como opción. Metadata dinámica ya existía en app/artwork/[sku]/page.js (Open Graph, X, canonical, robots y títulos de lotes); antes apuntaba a la fotografía original. Reutilizados site_settings (singleton), primary_artist_profile_id, artist_profiles.display_name, artworks.sku/title/title_en/medium/medium_en/year/dimensions/primary_image_url/artist_profile_id/updated_at y el logo público JBU. Sin campos de overrides por obra.

## Implementación y componentes
- Reutilizados: ArtworkShare, Modal/Button/Toggle/Select/TextInput/InlineNotification Carbon, useI18n, ImageUploader, requireCertificateAdmin (JWT + is_jbu_admin, roles separados), SITE_URL y placeholder existentes.
- Nuevo componente: SocialSharingSettings en Admin → Portada (/admin/home). Render editorial servidor en lib/social/render.server.jsx, no editor de diseño.
- Imágenes JPEG automáticas: horizontal 1200×630, Pinterest 1000×1500, Instagram 1080×1350. Obra completa, proporción preservada, sin precio. IBM Plex ya presente se distribuye con licencia para generar imágenes, no cambia fuentes del sitio.
- Horizontal: 27% branding / 73% obra. Vertical: obra dominante, franja inferior discreta. Controles globales de logo/nombre/dominio/fondo y visibilidad por formato. Desactivar Pinterest/Instagram oculta opción y sus URLs responden 404.
- LinkedIn añadido por URL oficial sin SDK. Instagram prepara archivo, luego permite compartir imagen si el dispositivo lo admite o descargar. Segundo tap preserva activación de usuario para compartir archivos.
- Analítica conserva RPC y canales originales, solo con consentimiento; LinkedIn/Instagram no se etiquetan falsamente como otro canal ni añaden una segunda tabla.

## Migración y variables
Ejecutar `supabase/migrations/20261112_social_sharing.sql` después de revisar: solo añade `site_settings.social_sharing jsonb NOT NULL DEFAULT '{}'` y check objeto. Reutiliza permisos/RLS existentes; no crea tablas ni cambios por artwork. Admin guardado autorizado en servidor, lectura de fila persistida obligatoria. Configuración pública sin secretos. **Ninguna variable nueva.** Usa las variables ya existentes NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY / SUPABASE_SERVICE_ROLE_KEY (la última solo para Admin autorizado).

## Verificación
- Build Next 16.3.4 aprobado, TypeScript tsgo aprobado.
- 56 pruebas aprobadas (52 datos/render/regresión + 4 autorización/readback); 5 pruebas anteriores omitidas por falta de jsdom.
- Lint de archivos nuevos/share: sin errores ni avisos. Lint general falla igual que main original: 102 errores y 90 avisos preexistentes, sin incremento. No se han corregido módulos ajenos.
- Lectura pública REAL JBU-001, previews HTTP 200 en tres formatos; archivos ~49/139/125 KB. Playwright desktop 1280 y móvil 390: menú, descarga Instagram 1080×1350, copia canónica y cero errores JS; sin overflow, menú sobre banner. Imagen completa y branding inspeccionados visualmente.
- Admin sin sesión responde 401; pruebas cubren 403 y cero filas. Guardar/recargar con Admin REAL no verificado: falta sesión autorizada y migración en producción. No se simula persistencia de producción.
- Build usa variables públicas reales y marcadores inertes solo para inicializadores privados legacy; pagos y credenciales privadas no se probaron ni modificaron.

## Activación y prueba real
1. Revisar e integrar la rama; aplicar migración y desplegar una nueva versión en Vercel. Hasta ese despliegue el sitio real conserva el sharing anterior.
2. Admin → Portada → Compartir en redes: configurar/guardar, recargar y confirmar opciones.
3. Obra real: https://www.josuebeltranuresti.com/artwork/JBU-001
4. Facebook: compartir la URL o pegarla en un grupo. Ver título y JPEG editorial; usar Sharing Debugger (https://developers.facebook.com/tools/debug/) y “Scrape Again”. No hace falta SDK ni publicar desde aquí.
5. WhatsApp: botón envía título/artista y enlace breve. Probar app móvil y WhatsApp Web; la preview horizontal llega por OG de la URL, no por adjuntar el JPEG.
6. Pinterest: botón abre Save con URL canónica + media vertical + descripción; revisar vertical antes de guardar un pin. No requiere OAuth/SDK.
7. Instagram Android/iPhone: tocar Instagram, esperar imagen preparada, tocar Compartir imagen cuando aparezca. Elegir Instagram SOLO si está entre destinos del sistema; no se garantiza esa presencia. Si no, Descargar imagen, guardar en Fotos/Archivos y publicar desde Instagram manualmente. Copiar enlace/caption por separado si se necesita. Publicación nativa en teléfonos físicos pendiente de probar.
8. LinkedIn: abrir botón y revisar preview; Post Inspector (https://www.linkedin.com/post-inspector/) permite nueva inspección de URL. No publicación automática.
9. X: enlace intent con título/artista/canónica; OG/X summary_large_image obtiene horizontal.

## Caché/versiones
URLs de imagen incluyen hash v de configuración, identidad, título, imagen y updated_at de obra/settings; cambiar esos datos cambia URL. Lecturas cacheadas 60 s, HTTP imagen 1 h + stale 1 h, ETag. Guardar ajustes invalida inmediatamente cache de settings. Cambios de bytes al mismo URL exigen actualizar updated_at de obra o volver a subir imagen/logo con URL nueva (ImageUploader ya usa nombres únicos), y desplegar si cambias logo local. No añadir overrides. Facebook/WhatsApp/LinkedIn tienen caché propia: primero nuevo deployment, después pedir scrape en sus herramientas; WhatsApp no ofrece invalidación garantizada y puede esperar hasta su siguiente rastreo. El enlace de obra permanece canónico; no compartir URLs de storage ni IDs internos. Sin herramienta externa compleja.

## Archivos modificados/creados
- `AGENTS.md`
- `app/admin/home/page.jsx`
- `app/api/admin/social-sharing/route.js`
- `app/api/admin/social-sharing/route.test.js`
- `app/artwork/[sku]/ArtworkDetailClient.tsx`
- `app/artwork/[sku]/page.js`
- `app/social/artwork/[sku]/[format]/route.js`
- `components/admin/SocialSharingSettings.jsx`
- `components/admin/SocialSharingSettings.module.css`
- `components/share/ArtworkShare.jsx`
- `components/share/ArtworkShare.module.css`
- `data/socialTheme.json`
- `lib/share.js`
- `lib/share.test.js`
- `lib/social/assets.server.js`
- `lib/social/config.js`
- `lib/social/config.test.js`
- `lib/social/data.server.js`
- `lib/social/render.server.jsx`
- `lib/social/render.test.js`
- `public/social/IBM-Plex-LICENSE.txt`
- `public/social/IBMPlexSans-Regular.woff`
- `supabase/migrations/20261112_social_sharing.sql`
- `docs/editorial-social-sharing.md`
