import { test } from 'node:test'
import assert from 'node:assert/strict'
import { sanitizeAnnouncementHtml, safeHref, filterStyle } from './announcementHtml.js'

// En el navegador se usa window.DOMParser; en pruebas se inyecta el de jsdom si existe.
let Parser = null
try {
  const { JSDOM } = await import('jsdom')
  Parser = new JSDOM('').window.DOMParser
} catch {}
const clean = (html) => sanitizeAnnouncementHtml(html, Parser)
const dom = { skip: !Parser && 'jsdom no instalado' }

test('safeHref bloquea javascript:, data: y protocolo relativo', () => {
  assert.equal(safeHref('javascript:alert(1)'), '')
  assert.equal(safeHref(' JaVa\tScRiPt:alert(1)'), '')
  assert.equal(safeHref('data:text/html,x'), '')
  assert.equal(safeHref('//evil.com'), '')
  assert.equal(safeHref('https://josuebeltranuresti.com'), 'https://josuebeltranuresti.com')
  assert.equal(safeHref('/catalog'), '/catalog')
})

test('filterStyle conserva tamaño/peso/color y quita url() o propiedades no permitidas', () => {
  assert.equal(filterStyle('font-size:16px;font-weight:600;'), 'font-size: 16px; font-weight: 600')
  assert.equal(filterStyle('background:url(https://x/y.png);color:red'), 'color: red')
  assert.equal(filterStyle('position:fixed;top:0'), '')
})

test('texto plano antiguo se muestra igual', dom, () => {
  assert.equal(clean('Envío nacional e internacional incluido'), 'Envío nacional e internacional incluido')
})

test('HTML permitido se conserva', dom, () => {
  assert.equal(clean('<strong>ENVÍO GRATIS</strong> nacional e internacional'), '<strong>ENVÍO GRATIS</strong> nacional e internacional')
  assert.equal(
    clean('<span style="font-size:18px;font-weight:700;">ENVÍO GRATIS</span><br><span style="font-size:13px;">Nacional</span>'),
    '<span style="font-size: 18px; font-weight: 700">ENVÍO GRATIS</span><br><span style="font-size: 13px">Nacional</span>'
  )
})

test('elimina scripts, iframes, object/embed y su contenido', dom, () => {
  assert.equal(clean('Hola<script>alert(1)</script>'), 'Hola')
  assert.equal(clean('<iframe src="x"></iframe><object data="x"></object><embed src="x">ok'), 'ok')
})

test('elimina manejadores de eventos y enlaces javascript:', dom, () => {
  assert.equal(clean('<span onclick="alert(1)" onmouseover="x()">a</span>'), '<span>a</span>')
  assert.equal(clean('<img src=x onerror=alert(1)>b'), 'b')
  assert.equal(clean('<a href="javascript:alert(1)">c</a>'), '<a>c</a>')
  assert.equal(clean('<svg onload=alert(1)><a>d</a></svg>e'), 'e')
})

test('target _blank fuerza rel noopener', dom, () => {
  assert.equal(
    clean('<a href="https://x.com" target="_blank" rel="opener">x</a>'),
    '<a href="https://x.com" target="_blank" rel="noopener noreferrer">x</a>'
  )
})

test('vacío no renderiza nada', () => {
  assert.equal(sanitizeAnnouncementHtml('   '), '')
})
