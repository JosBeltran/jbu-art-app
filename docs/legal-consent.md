# Consentimiento legal y cookies de JBU

## Estado y activación segura
Implementación aislada en `review/legal-consent-cookies`; main y los datos de producción no se modifican. Aplicar `supabase/migrations/20261105_legal_consent.sql` coordinado con el despliegue de esta rama: el nuevo trigger exige evidencia en altas por correo, por lo que versiones antiguas del formulario ya no pueden crear cuentas después de aplicarlo. No ejecutar mientras siga sirviéndose el formulario antiguo. Usar una ventana de mantenimiento de registro para desplegar y aplicar la migración, y luego probar con una cuenta nueva por email y Google. No se han probado altas ni OAuth con producción.

La migración es transaccional; no fabrica aceptaciones históricas, no toca perfiles, roles, compras, ofertas, subastas, certificados ni sus reglas. Auditar previamente triggers de auth.users y privilegios del rol de Auth en producción. El esquema de perfiles no se cambia y no se requiere una cuenta nueva para usuarios existentes.

## 1. Archivos modificados
Ver la lista final al final de este informe. Los archivos de consentimiento nuevos viven en components/consent y lib/legalConsent*. Las pantallas públicas usan el InfoShell editorial actual y Carbon. Header, logo y estilos globales no se modifican.

## 2. Tabla y columnas
Nueva tabla privada `public.user_legal_consents`: `user_id` (FK auth.users, cascade), `terms_accepted_at`, `privacy_accepted_at`, `terms_version`, `privacy_version`, `acceptance_source`. Clave compuesta usuario/versiones. Fechas generadas por servidor; versiones iniciales 1.0. No se añaden columnas a profiles. RLS: lectura solo del propio usuario; sin escritura directa desde anon/authenticated. Las funciones get_my_legal_consent y accept_current_legal_consent solo son ejecutables por authenticated. La segunda usa auth.uid() e inserción idempotente; nunca recibe un UUID, fecha o versión del cliente.

## 3. Mecanismo de consentimiento legal
Registro correo: checkbox explícito -> metadata de alta con accepted/versions -> trigger AFTER INSERT en auth.users -> fila privada con fechas reales del servidor. El trigger rechaza altas email sin evidencia vigente. Modificar después metadata del usuario no crea ni altera la evidencia. Google: sesión establecida por el OAuth existente -> comprobación privada -> /consent si falta evidencia -> RPC autenticada guarda -> lectura devuelta comprobada antes del destino. Un nuevo cambio de versiones requiere actualizar juntos los documentos, constantes y funciones SQL, sin sobrescribir filas anteriores.

## 4. Registro por email
Sin marcar no se llama signUp y aparece el mensaje solicitado. Enlaces a /terms y /privacy en nueva pestaña; campos conservados. Se mantiene confirmación por correo y la pantalla existente de revisar email. Con sesión inmediata mantiene el destino existente. Crear cuenta sigue siendo gratis; texto solicitado ES/EN debajo del formulario.

## 5. Registro/login Google
No se modifica el proveedor ni el intercambio OAuth. Se comprueban tanto retorno /auth/callback como retorno alternativo y acceso directo a pantallas no públicas. Sin evidencia de versión actual se muestra Antes de continuar y checkbox obligatorio. La cuenta técnica de Auth ya existe al volver de Google; el acceso ordinario de incorporación se completa solo al registrar aceptación. Usuarios Google existentes sin evidencia también deben aceptarla, sin fabricar consentimiento. Si la versión está aceptada no se repite. Fallo de lectura/escritura mantiene al usuario en consentimiento y no indica éxito. Las APIs existentes conservan autorización actual: esta incorporación no sustituye permisos de compra/RLS ni pretende bloquear todas las llamadas API por aceptación.

## 6–8. Cookies y tecnologías encontradas
Inventario de código, NO inventario certificado del navegador de producción:
- Auth por @supabase/ssr: cookies `sb-<ref>-auth-token` (posibles fragmentos), almacenamiento de intercambio PKCE `sb-…-auth-token-code-verifier`; nombres exactos dependen del proyecto/SDK. Necesarias para sesión/seguridad.
- Carrito en memoria y `jbu_pending_action`: continuidad necesaria de la acción solicitada tras login; no se cambia carrito.
- `jbu:auth-next`, `jbu:auth-pending`: retorno OAuth necesario; `jbu-lang`, `jbu-theme`: preferencias funcionales elegidas.
- `jbu-welcome-promo-dismissed`, `jbu-promo-claim-<user>`: supresión de promoción y guardas funcionales del reclamo existente; sin SDK publicitario. No se modifican promociones.
- `jbu-cookie-consent`: localStorage de categorías/fecha/versión. Necesario para recordar la elección. No es una cookie ni una tabla de usuarios.
- Vercel Analytics: servicio existente, sin cookies publicitarias; se respeta consentimiento de analítica igualmente, se retrasa carga y se revalida beforeSend.
- Contadores propios `increment_artwork_view`, `record_artwork_share` y marcador `jbu:viewed-artwork:<id>`: medición opcional, bloqueada antes de consentimiento de analítica. La acción de compartir funciona igual sin medirla.
- Tidio: script/chat existente, no indispensable para compra ni autenticación; ahora solo carga con categoría Marketing y chat opcional. Sus cookies/IDs reales deben inventariarse en producción. No se presume necesario por ser chat.
- No se encontraron píxeles Meta ni Google Analytics/gtag. Categoría preparada, sin nuevas integraciones.
- Stripe externo puede establecer cookies/IDs de seguridad y fraude (p. ej. __stripe_mid/__stripe_sid dependiendo del servicio). No se confirmó su presencia/duración en este sitio y no se cambió checkout. Cookies de Google en su origen quedan fuera del control de esta plataforma.

## 9. Modificar/retirar preferencias
Pie de Home y páginas informativas/legales -> Preferencias de cookies. Categorías opcionales independientes, Solo necesarias o Guardar preferencias. Necesarias no desactivables. Cambiar preferencias conserva la elección anterior hasta guardar. Consentimiento se guarda en este navegador con fecha, categorías y versión; ausencia/datos inválidos no autoriza opcionales. Refusal permanece explícito y no hace reaparecer banner. Se sincroniza entre pestañas. Retirada detiene nuevas mediciones; chat previamente cargado requiere recarga para descargar código del proveedor. No elimina retroactivamente datos ni cookies de otros orígenes. Borrar almacenamiento o cambiar versión vuelve a preguntar.

## Validación y límites
212 pruebas automatizadas aprobadas (9 específicas incluyendo SQL en PostgreSQL local); tipos sin errores. Prueba visual con Playwright: registro sin marcar bloqueado sin petición de alta, enlaces en nueva pestaña, preferencias necesarias guardadas, scripts Tidio/Vercel ausentes sin permiso, español/escritorio e inglés/oscuro/móvil, sin errores de página. No se crearon cuentas ni se probó Google real: sin sesión/servicio de producción autorizado. No se aplicó SQL en producción ni se garantiza la configuración alojada de alta/email/OAuth.

## Contenido legal
Se reutilizó el contenido comercial existente; datos en data/legalDocuments.js editables sin tocar componentes. Se corrigió la afirmación genérica de anonimato técnico y se añadieron disclosures de consentimiento/servicios comprobados. No se atribuye el texto a abogados. El propietario debe validar el texto existente (impuestos, envíos, devoluciones, ARCO, retención y obligaciones locales) antes de publicar y aceptar nuevas versiones; este cambio no constituye revisión jurídica.

## Lista de archivos
- `AGENTS.md`
- `proxy.ts`
- `app/ClientLayout.jsx`
- `app/layout.tsx`
- `app/sitemap.ts`
- `data/legalDocuments.js`
- `docs/legal-consent.md`
- `lib/seo.js`
- `lib/legalConsent.js`
- `lib/cookieConsent.js`
- `lib/legalConsent.client.js`
- `lib/legalConsent.test.js`
- `lib/legalConsent.database.test.js`
- `supabase/migrations/20261105_legal_consent.sql`
- `components/auth/OAuthReturnHandler.jsx`
- `components/chat/TidioArtworkContext.jsx`
- `components/chat/TidioChat.jsx`
- `components/share/ArtworkShare.jsx`
- `components/consent/Consent.module.css`
- `components/consent/CookieConsent.jsx`
- `components/consent/LegalCheckbox.jsx`
- `components/consent/LegalDocument.jsx`
- `app/info/InfoPage.jsx`
- `app/landing/LandingClient.jsx`
- `app/login/page.jsx`
- `app/signup/page.jsx`
- `app/consent/page.jsx`
- `app/consent/layout.js`
- `app/terms/page.jsx`
- `app/privacy/page.jsx`
- `app/cookies/page.jsx`
- `app/info/politica-de-privacidad/page.jsx`
- `app/info/terminos-de-servicio/page.jsx`
- `app/auth/callback/page.jsx`
- `app/artwork/[sku]/ArtworkDetailClient.tsx`
