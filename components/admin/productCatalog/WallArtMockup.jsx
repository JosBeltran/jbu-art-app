import OptimizedImg from '@/components/media/OptimizedImg'
import styles from './WallArtStudio.module.css'

export default function WallArtMockup({ image, alt, variant, fit, borderMm = 0, scene = 'gallery', framed = false }) {
  const width = Number(variant?.widthMm)
  const height = Number(variant?.heightMm)
  const ratio = width > 0 && height > 0 ? Math.min(4, Math.max(0.25, width / height)) : 1
  const colors = { black:'#252323',white:'#f7f5ef',natural:'#a57b50',oak:'#ae8559' }
  const frame = framed ? (colors[variant?.attributes?.frame_color?.toLowerCase()] || '#81776e') : undefined
  const inset = borderMm > 0 && width > 2*borderMm && height > 2*borderMm
    ? {width: (1 - 2*borderMm/width)*100+'%', height:(1 - 2*borderMm/height)*100+'%', placeSelf:'center'} : {}
  return <div className={scene === 'wall' ? styles.wall : styles.gallery}>
    <div className={styles.print} style={{ aspectRatio: ratio, borderColor:frame, width: ratio < 1 ? `${ratio * 55}%` : '55%' }}>
      <OptimizedImg src={image} alt={alt} sizes="(max-width: 660px) 50vw, 230px" style={{ objectFit: fit, ...inset }} />
    </div>
  </div>
}
