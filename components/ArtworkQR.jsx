'use client'

import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Tile, Button, Tag } from '@carbon/react'
import { Download } from '@carbon/icons-react'

export default function ArtworkQR({ sku, title }) {
  const qrRef = useRef()

  // URL pública final de la obra
  const targetUrl = `https://josuebeltranuresti.com/artwork/${sku}`

  const downloadSVG = () => {
    const svgElement = qrRef.current.querySelector('svg')
    if (!svgElement) return
    const svgData = new XMLSerializer().serializeToString(svgElement)
    const svgBlob = new Blob([svgData], { type: 'image/svg+xml;charset=utf-8' })
    const SVGUrl = URL.createObjectURL(svgBlob)

    const downloadLink = document.createElement('a')
    downloadLink.href = SVGUrl
    downloadLink.download = `QR-${sku}.svg`
    document.body.appendChild(downloadLink)
    downloadLink.click()
    document.body.removeChild(downloadLink)
  }

  return (
    <Tile style={{ backgroundColor: 'var(--cds-layer-01)', border: '1px solid var(--cds-border-subtle01)', marginBottom: '1rem', textAlign: 'center' }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
        <span className="cds--label" style={{ color: 'var(--cds-text-secondary)', letterSpacing: '0.5px' }}>
          Ficha Física & Registro
        </span>
        <Tag type="cool-gray" size="sm" style={{ fontFamily: 'monospace', margin: 0 }}>
          {sku}
        </Tag>
      </div>

      {/* SVG del QR con contenedor adaptado al modo oscuro/claro de Carbon */}
      <div 
        ref={qrRef} 
        style={{ 
          display: 'inline-flex', 
          justifyContent: 'center', 
          padding: '1rem', 
          backgroundColor: '#ffffff', // Fondo blanco recomendado para que el lector QR escanee sin problemas
          borderRadius: '4px', 
          border: '1px solid var(--cds-border-subtle01)',
          marginBottom: '0.75rem'
        }}
      >
        <QRCodeSVG 
          value={targetUrl} 
          size={140}
          level="H" // Alto nivel de corrección de errores
          includeMargin={false}
        />
      </div>

      <p style={{ fontSize: '0.75rem', color: 'var(--cds-text-secondary)', lineHeight: '1.25', marginBottom: '1rem' }}>
        Escanea para verificar autenticidad y registro de proveniencia en Estudio JBU.
      </p>

      <Button
        kind="secondary"
        size="sm"
        onClick={downloadSVG}
        renderIcon={Download}
        style={{ width: '100%', justifyContent: 'center' }}
      >
        Descargar SVG para Impresión
      </Button>
    </Tile>
  )
}