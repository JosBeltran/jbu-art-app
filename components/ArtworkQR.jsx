'use client'

import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'

export default function ArtworkQR({ sku, title }) {
  const qrRef = useRef()

  // URL pública final de la obra
  const targetUrl = `https://josueuresti.com/artwork/${sku}`

  const downloadSVG = () => {
    const svgElement = qrRef.current.querySelector('svg')
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
    <div className="p-4 border border-gray-200 rounded-xl bg-white space-y-3 text-center shadow-sm">
      <div className="flex justify-between items-center mb-1">
        <span className="text-[10px] font-bold text-gray-400 uppercase tracking-widest">
          Ficha Física & Registro
        </span>
        <span className="text-[10px] font-mono text-gray-500 bg-gray-100 px-1.5 py-0.5 rounded">
          {sku}
        </span>
      </div>

      {/* SVG del QR en alta definición */}
      <div ref={qrRef} className="flex justify-center p-2 bg-white rounded-lg inline-block border border-gray-100">
        <QRCodeSVG 
          value={targetUrl} 
          size={140}
          level="H" // Alto nivel de corrección de errores (permite lectura fácil)
          includeMargin={false}
        />
      </div>

      <p className="text-[11px] text-gray-500 leading-tight">
        Escanea para verificar autenticidad y registro de proveniencia en Estudio JBU.
      </p>

      <button 
        onClick={downloadSVG}
        className="w-full text-[11px] font-bold text-gray-700 bg-gray-50 hover:bg-gray-100 py-2 rounded-lg border border-gray-200 transition"
      >
        Descargar SVG para Impresión ⬇
      </button>
    </div>
  )
}