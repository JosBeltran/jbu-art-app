import OptimizedImg from '@/components/media/OptimizedImg'
import styles from './WallArtStudio.module.css'

export default function WallArtMockup({ image, alt, variant, fit, scene = 'gallery' }) {
  const width = Number(variant?.widthMm)
  const height = Number(variant?.heightMm)
  const ratio = width > 0 && height > 0 ? Math.min(4, Math.max(0.25, width / height)) : 1
  return <div className={scene === 'wall' ? styles.wall : styles.gallery}>
    <div className={styles.print} style={{ aspectRatio: ratio, width: ratio < 1 ? `${ratio * 55}%` : '55%' }}>
      <OptimizedImg src={image} alt={alt} sizes="(max-width: 660px) 50vw, 230px" style={{ objectFit: fit }} />
    </div>
  </div>
}
