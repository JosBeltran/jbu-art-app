# Revisión de catálogo, fichas y órdenes JBU

## Entrega y límites
- Catálogo y fichas: código validado; publicación y comprobación visual de producción pendientes.
- Órdenes: propuesta aislada en una rama de revisión, **no activada en main**. No se afirma que el guardado real esté corregido.
- No hay sesión Admin ni acceso autorizado a la base de producción en este entorno. Su esquema, permisos y estados permitidos no pueden confirmarse leyendo el repositorio.

## 1. Causa raíz de órdenes: comprobada frente a pendiente
La pantalla anterior hacía UPDATE desde el navegador, aceptaba ausencia de error como éxito y mezclaba el payload con el estado local. Un UPDATE de cero filas por RLS puede devolver ausencia de error: la pantalla podía anunciar éxito aunque nada persistiera. Tampoco verificaba una autorización Admin en el servidor para esta operación.

Esto demuestra un defecto en la detección de guardado; **no demuestra que RLS sea la causa concreta de producción**. El repo no contiene CREATE TABLE de orders, enum de status ni sus políticas. Falta identificar si el fallo real es permisos, estados incompatibles, columnas o automatizaciones mediante `scripts/audit-admin-orders.sql` (solo lectura).

## 2. Cambios de catálogo y ficha
- `lib/artworks.js`: consultas de catálogo, relacionadas y lotes públicos comparten elegibilidad; respaldo a artworks aplica la misma regla y falla cerrado si no se puede leer la Serie.
- `lib/homeSeries.js`: parent por ID autoritativo, nombre legacy si no hay ID; solo Serie efectiva activa permite mostrar imágenes de obras.
- `app/catalog/CatalogClient.tsx`: elimina precios en tarjetas, muestra VENDIDO/SOLD, conserva filtros, orden y compra disponible.
- `app/artwork/[sku]/ArtworkDetailClient.tsx`: vendido oculta precio original, compra, carrito y ofertas; estado bilingüe en ficha y barra móvil; no pasa precios al resumen de impacto; relacionadas con elegibilidad pública.
- `components/auction/HomeAuctions.jsx`, `lib/auctionEvents.js`, `app/como-funciona/PlatformScreens.jsx`: imágenes/obras de lotes públicos usan consulta elegible. No cambia timing, pujas ni pagos.
- `app/catalog/page.js`: conserva presentación e incluye metadatos sociales de catálogo.
- `supabase/migrations/20261026_active_series_discovery.sql`: regla equivalente en vista security_invoker, conserva RLS; requiere aplicar en producción después de las migraciones previas de Series.

## 3. Regla exacta de visibilidad
Publicación individual en AVAILABLE u OWNED AND Serie efectiva active.
- coming_soon solo se vuelve efectiva active si auto_launch está habilitado y launch_date ya venció, conservando lanzamiento programado.
- archived, outlet y coming_soon sin lanzar excluyen sus obras de listas públicas, aunque estén destacadas o disponibles.
- series_id tiene precedencia; nombre legacy solo cuando no hay ID.
- Sin Serie conserva elegibilidad individual; ID asignado sin padre verificable falla cerrado.
- URLs directas de ficha, certificados y verificación conservan sus convenciones existentes. No se reescriben sus accesos.

## 4. Vendido y compra
`getAvailability()` existente: availability_status explícito es la fuente canónica; cuando falta, ownership_status SOLD/CLAIM_PENDING/CLAIMED/VERIFIED deriva SOLD.
`isArtworkPurchasable()` existente se conserva. Checkout ya vuelve a leer la obra y rechaza originales no disponibles; sin cambios a Stripe, precios, órdenes de pago, reclamación, titularidad o certificados.
Fine Art Prints mantienen su modelo independiente y precio; no son la venta del original adquirido.

## 5. Propuesta de órdenes, bloqueada para activación
Archivos de revisión: `lib/orderOperations.js`, `lib/adminOrders.server.js`, `lib/orderHandlers.server.js`, `app/api/admin/orders/route.js`, `app/admin/orders/page.jsx`.
- Autorización por sesión verificada y role admin en tabla separada user_roles; no usa perfiles, listas de correo ni almacenamiento del navegador.
- El repo histórico usa roles en profiles y no declara user_roles; **no se supone que user_roles exista en producción**. Si no existe o no es legible, la propuesta devuelve error y deniega acceso. Por eso no se activa en main todavía.
- Cliente privilegiado solo después de comprobar sesión/rol, siguiendo patrón servidor del proyecto; no desactiva ni modifica RLS.
- Estados conservados del formulario: PAYMENT_RECEIVED, PROCESSING, SHIPPED, DELIVERED, CANCELLED. **Compatibilidad con enum real pendiente**.
- Editables: status, courier_name, tracking_number, tracking_url, notes.
- Inmutables: ID, identificadores Stripe, importes, artículos/precios pagados, cliente/dirección pagada, titularidad/certificados. No agrega otro formulario.
- Fechas shipped_at/delivered_at se asignan al primer cambio correspondiente; las previas se conservan; triggers existentes siguen ejecutándose.
- Requiere fila devuelta y segunda lectura; UI muestra valores devueltos, no copia optimista del payload. Errores útiles ES/EN; logs solo razón/código, sin datos del comprador.
- Ningún cambio de esquema/RLS para órdenes se propone sin la auditoría real.

## 6. Pruebas
81 pruebas aprobadas en ejecuciones aisladas: Series/visibilidad, vendido/compra, campos inmutables, fechas, URL de rastreo, cero filas, discrepancia de relectura, error de enum, autorización real de helper con clientes simulados y denegación HTTP. Incluye regresión de READY FOR CLAIM, traducciones y compartir.
Verificación de tipos con tsgo: aprobada.
Render de catálogo con originales disponibles y vendidos: ambos presentes, VENDIDO visible y ningún precio de tarjeta.
Estas pruebas usan datos simulados; **no equivalen a persistencia en producción**.

## 7. Qué falta para cerrar
1. Aplicar `20261026_active_series_discovery.sql` en producción (después de las migraciones previas de Series).
2. Ejecutar `scripts/audit-admin-orders.sql` y revisar estructura, enum/check, grants, RLS, triggers y tabla separada de roles. No incluye secretos ni filas de clientes.
3. Confirmar/provisionar roles separados de forma autorizada antes de activar la rama de órdenes; no se migran permisos automáticamente.
4. Ajustar propuesta al modelo confirmado; desplegar y probar con Admin real: cambiar estado/carrier/tracking/notes, guardar, recargar y comprobar valores; usuario ordinario debe recibir denegación.
5. Comprobar escritorio/móvil ES/EN claro/oscuro en producción; pagos y automatizaciones de órdenes requieren prueba real.
