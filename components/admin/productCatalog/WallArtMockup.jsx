import OptimizedImg from '@/components/media/OptimizedImg'
import {mockupAppearance} from '@/lib/productCatalog/configuration'
import styles from './WallArtStudio.module.css'

export default function WallArtMockup({ image, alt, variant, fit, borderMm = 0, scene = 'gallery', framed = false }) {
  const appearance = mockupAppearance(variant,borderMm,framed)
  if (!appearance) return <div className={styles.gallery}><span aria-hidden="true">—</span></div>
  const {ratio,frameColor,frameWidth,insetX,insetY} = appearance
  return <div className={scene === 'wall' ? styles.wall : styles.gallery}>
    <div className={styles.print} style={{aspectRatio:ratio,width:`${Math.min(55,55*ratio)}%`,
      boxShadow:frameColor ? `0 0 0 ${frameWidth} ${frameColor}, 4px 6px 10px #23211b55` : undefined}}>
      <div className={styles.printImage} style={{inset:`${insetY}% ${insetX}%`}}>
        <OptimizedImg src={image} alt={alt} sizes="(max-width: 660px) 50vw, 230px" style={{objectFit:fit}} />
      </div>
    </div>
  </div>
}
