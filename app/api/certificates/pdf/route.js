// Ruta antigua: generaba un PDF distinto en cada descarga y exponía datos del propietario.
// El PDF oficial ahora es persistente; se redirige a la verificación pública, donde se descarga.
export async function GET(request) {
  const url = new URL(request.url)
  const sku = String(url.searchParams.get('sku') || '').trim()
  return Response.redirect(new URL(sku ? `/verify/${encodeURIComponent(sku)}` : '/', url.origin), 302)
}
