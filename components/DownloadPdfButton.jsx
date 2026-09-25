'use client'

import { useState } from 'react'
import { Button } from '@carbon/react'
import { DocumentPdf } from '@carbon/icons-react'
import { useI18n } from '@/components/I18nProvider'

export default function DownloadPdfButton({ elementId, sku }) {
  const { t } = useI18n()
  const [downloading, setDownloading] = useState(false)

  const handleDownload = async () => {
    setDownloading(true)
    try {
      const html2canvas = (await import('html2canvas')).default
      const { jsPDF } = await import('jspdf')

      const element = document.getElementById(elementId)
      if (!element) {
        alert(t('No se encontró el contenedor del certificado', 'Certificate container not found'))
        return
      }

      const canvas = await html2canvas(element, {
        scale: 2,
        backgroundColor: '#ffffff',
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
    <Button
      kind="primary"
      size="md"
      onClick={handleDownload}
      disabled={downloading}
      renderIcon={DocumentPdf}
      className="print:hidden"
      style={{ backgroundColor: 'var(--jbu-purple, #6929c4)', color: 'var(--jbu-on-color, #fff)' }}
    >
      {downloading ? t('Generando PDF...', 'Generating PDF...') : t('Descargar certificado (PDF)', 'Download certificate (PDF)')}
    </Button>
  )
}
