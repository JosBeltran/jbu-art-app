# Versiones de obra y procedencia

En el editor de una obra, **Versiones de la obra** permite tres operaciones.

| Operación | Resultado |
| --- | --- |
| Reemplazar fotografía | Edita la misma ficha con su SKU e historial. |
| Registrar versión anterior | Crea una ficha histórica con una foto propia o la foto principal ya guardada. La obra de origen sigue vigente. |
| Crear versión sucesora | Crea un borrador con una foto nueva y un SKU propio. Al publicarlo, la ficha anterior pasa a histórica y deja de venderse como original. La venta de la sucesora requiere una selección explícita y un precio público guardado. |

Las versiones reutilizan `artworks` y un vínculo a la ficha de origen. La procedencia registra la etapa, la nota y, si se seleccionó, el ID de un evento de la obra de origen en los metadatos administrativos. Las versiones se pueden encadenar sin duplicar un certificado, comprador, orden, inventario o variante de print. Si la ficha anterior ya tenía prints, conservan su obra, identificadores y reglas de compra. Para ofrecer prints de una versión recién registrada, hay que configurarlos en esa ficha.

Las versiones históricas salen de portada, catálogo, series, la lista general de prints y el índice de buscadores. Su ficha sigue accesible desde la familia pública de la obra, con un enlace a sus prints cuando tiene variantes activas. El registro de un original vendido o certificado se puede documentar con una versión anterior. La sucesión comercial se limita a originales únicos publicados y sin venta, reserva, certificado, subasta activa u oferta con pago pendiente.

## Despliegue

1. Aplicar `20261123_artwork_versions.sql` en staging antes del despliegue de la aplicación. Verificar que el rol Admin de Supabase y la ruta de subida `artwork-images/versions/` estén habilitados.
2. Crear una versión histórica y una sucesora a partir de una obra de prueba con prints. Revisar la visibilidad pública, confirmar que los prints conservan sus datos y probar en Stripe una compra desde la ficha histórica.
3. Retirar del tráfico de compra el original que vaya a sucederse antes de publicar si puede tener checkouts de Stripe ya abiertos. El flujo actual no reserva originales cuando se genera una sesión. Un checkout previo puede aceptar el pago y requerir conciliación si se completa después del retiro del original.

Las pruebas automatizadas usan PostgreSQL embebido. La migración se prueba contra un fixture con la estructura requerida y debe verificarse también en staging.
