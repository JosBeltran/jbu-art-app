'use client'

import { useState } from 'react'

export default function DownloadPdfButton({ elementId, sku }) {
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const element = document.getElementById(elementId)
      if (!element) {
        alert('No se encontró el contenedor del certificado')
        return
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#FAF8F5',
        useCORS: true,
        allowTaint: true,
        logging: false,
        onclone: (clonedDoc) => {
          // Remover o forzar colores estándar en el clon para evitar el error 'lab()' / 'oklch()'
          const clonedElement = clonedDoc.getElementById(elementId)
          if (clonedElement) {
            clonedElement.querySelectorAll('*').forEach((el) => {
              const computed = window.getComputedStyle(el)
              // Convertir colores que usen lab/oklch si es necesario
              if (computed.backgroundColor && computed.backgroundColor.includes('lab')) {
                el.style.backgroundColor = '#171717'
              }
              if (computed.color && computed.color.includes('lab')) {
                el.style.color = '#ffffff'
              }
            })
          }
        }
      })

      const imgData = canvas.toDataURL('image/png')
      const pdf = new jsPDF({
        orientation: 'portrait',
        unit: 'px',
        format: [canvas.width, canvas.height]
      })

      pdf.addImage(imgData, 'PNG', 0, 0, canvas.width, canvas.height)
      pdf.save(`Certificado_Autenticidad_${sku}.pdf`)
    } catch (err) {
      console.error('Error al generar PDF:', err)
      // Si html2canvas vuelve a fallar por incompatibilidad de CSS, usar fallback de impresión nativa
      window.print()
    } finally {
      setDownloading(false)
    }
  }

  return (
    <button
      onClick={handleDownload}
      disabled={downloading}
      className="w-full py-3 bg-amber-500 hover:bg-amber-400 disabled:opacity-50 text-neutral-950 font-mono text-xs font-bold rounded-xl shadow-lg transition flex items-center justify-center gap-2 print:hidden"
    >
      <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor">
        <path strokeLinecap="round" strokeLinejoin="round" strokeWidth={2} d="M12 10v6m0 0l-3-3m3 3l3-3m2 8H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
      </svg>
      {downloading ? 'Generando PDF...' : 'Descargar Certificado (PDF)'}
    </button>
  )
}