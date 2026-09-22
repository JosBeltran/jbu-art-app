'use client'

import { useRef } from 'react'
import { QRCodeSVG } from 'qrcode.react'
import { Button, Tag } from '@carbon/react'
import { Download } from '@carbon/icons-react'
import styles from './ArtworkQR.module.css'

export default function ArtworkQR({ sku, title }) {
  const qrRef = useRef()

  const targetUrl = `https://josuebeltranuresti.com/artwork/${sku}`

  const downloadSVG = () => {
    const svgElement = qrRef.current?.querySelector('svg')
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
    URL.revokeObjectURL(SVGUrl)
  }

  return (
    <section className={styles.panel}>
      <div className={styles.head}>
        <p className={styles.label}>Ficha física y registro</p>
        <Tag type="cool-gray" size="sm">{sku}</Tag>
      </div>

      <div className={styles.body}>
        <div className={styles.code} ref={qrRef}>
          <QRCodeSVG value={targetUrl} size={116} level="H" includeMargin={false} />
        </div>
        <p className={styles.text}>
          Escanea para verificar la autenticidad de {title} y consultar su registro de proveniencia en Estudio JBU.
        </p>
      </div>

      <div className={styles.action}>
        <Button
          className={styles.fullButton}
          kind="ghost"
          size="sm"
          onClick={downloadSVG}
          renderIcon={Download}
        >
          Descargar QR en SVG
        </Button>
      </div>
    </section>
  )
}
