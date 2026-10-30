/**
 * Sanitizador de HTML limitado para el Announcement Banner.
 *
 * El contenido lo escribe un Admin (y en el futuro otros artistas), así que se
 * trata como no confiable: se interpreta con DOMParser (documento inerte, no
 * ejecuta scripts) y se reconstruye SOLO con etiquetas, atributos, URLs y
 * propiedades CSS de una lista permitida. Todo lo demás se descarta.
 * El texto plano antiguo sigue funcionando: se escapa y se devuelve tal cual.
 */

export const ALLOWED_TAGS = new Set([
  'strong', 'b', 'em', 'i', 'u', 's', 'small', 'mark', 'span', 'a', 'br', 'p', 'div',
])

// Se eliminan junto con todo su contenido.
const DROP_WITH_CONTENT = new Set([
  'script', 'style', 'iframe', 'object', 'embed', 'template', 'noscript',
  'svg', 'math', 'frame', 'frameset', 'applet', 'link', 'meta', 'base',
  'form', 'input', 'button', 'textarea', 'select', 'video', 'audio', 'img', 'title', 'head',
])

const ALLOWED_ATTRS = new Set(['class', 'style', 'href', 'target', 'rel', 'title'])

export const ALLOWED_CSS = new Set([
  'color', 'background', 'background-color', 'font-size', 'font-weight', 'font-style',
  'font-family', 'text-decoration', 'text-align', 'text-transform', 'letter-spacing',
  'line-height', 'padding', 'padding-top', 'padding-bottom', 'padding-left', 'padding-right',
  'margin', 'margin-top', 'margin-bottom', 'margin-left', 'margin-right',
  'display', 'border-radius', 'white-space', 'opacity',
])

const VOID_TAGS = new Set(['br'])

const escapeText = (s) =>
  String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

const escapeAttr = (s) => escapeText(s).replace(/"/g, '&quot;').replace(/'/g, '&#39;')

/** Devuelve una URL segura o '' (http/https/mailto/tel, rutas relativas y anclas). */
export function safeHref(value) {
  // Quita espacios y caracteres de control que los navegadores ignoran (p. ej. "java\tscript:").
  const v = String(value || '').replace(/[\u0000-\u0020\u007f-\u009f]/g, '')
  if (!v) return ''
  if (/^(https?:|mailto:|tel:)/i.test(v)) return String(value).trim()
  if (/^[a-z][a-z0-9+.-]*:/i.test(v)) return '' // javascript:, data:, vbscript:, etc.
  if (v.startsWith('//')) return '' // protocolo relativo a otro dominio
  return String(value).trim() // /ruta, #ancla, ?query, ruta relativa
}

/** Filtra declaraciones CSS inline a una lista permitida y valores inofensivos. */
export function filterStyle(style) {
  const out = []
  for (const decl of String(style || '').split(';')) {
    const idx = decl.indexOf(':')
    if (idx < 0) continue
    const prop = decl.slice(0, idx).trim().toLowerCase()
    const val = decl.slice(idx + 1).trim()
    if (!ALLOWED_CSS.has(prop) || !val) continue
    if (/url\s*\(|expression\s*\(|javascript:|@import|behavior|-moz-binding|[\\<>{}]|\/\*/i.test(val)) continue
    if (val.length > 200) continue
    out.push(`${prop}: ${val}`)
  }
  return out.join('; ')
}

function serializeElement(el) {
  const tag = el.tagName.toLowerCase()
  if (DROP_WITH_CONTENT.has(tag)) return ''
  const children = serializeChildren(el)
  if (!ALLOWED_TAGS.has(tag)) return children // etiqueta desconocida: conserva solo su texto

  const attrs = []
  let target = ''
  for (const { name, value } of Array.from(el.attributes || [])) {
    const n = name.toLowerCase()
    if (!ALLOWED_ATTRS.has(n)) continue // descarta on*, id, src, etc.
    if (n === 'href') {
      if (tag !== 'a') continue
      const href = safeHref(value)
      if (href) attrs.push(`href="${escapeAttr(href)}"`)
    } else if (n === 'style') {
      const css = filterStyle(value)
      if (css) attrs.push(`style="${escapeAttr(css)}"`)
    } else if (n === 'target') {
      if (tag === 'a' && (value === '_blank' || value === '_self')) target = value
    } else if (n === 'rel') {
      // se recalcula abajo
    } else {
      attrs.push(`${n}="${escapeAttr(value)}"`)
    }
  }
  if (target) {
    attrs.push(`target="${target}"`)
    if (target === '_blank') attrs.push('rel="noopener noreferrer"')
  }
  const open = `<${tag}${attrs.length ? ' ' + attrs.join(' ') : ''}>`
  return VOID_TAGS.has(tag) ? open : `${open}${children}</${tag}>`
}

function serializeChildren(node) {
  let html = ''
  for (const child of Array.from(node.childNodes || [])) {
    if (child.nodeType === 3) html += escapeText(child.nodeValue)
    else if (child.nodeType === 1) html += serializeElement(child)
    // comentarios y demás nodos se descartan
  }
  return html
}

/**
 * Sanitiza HTML del banner. `parser` permite inyectar DOMParser en pruebas.
 * Sin DOMParser disponible (SSR) devuelve el contenido como texto escapado.
 */
export function sanitizeAnnouncementHtml(html, parser) {
  const source = String(html || '')
  if (!source.trim()) return ''
  const Parser = parser || (typeof DOMParser !== 'undefined' ? DOMParser : null)
  if (!Parser) return escapeText(source.replace(/<[^>]*>/g, ''))
  const doc = new Parser().parseFromString(`<body>${source}</body>`, 'text/html')
  return serializeChildren(doc.body).trim()
}
