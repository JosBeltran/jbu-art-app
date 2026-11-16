'use client'
import CollectionView from '@/components/collection/CollectionView'
import GalleryManagement from '@/components/collector-gallery/GalleryManagement'
import styles from './Collection.module.css'

export default function CollectionPage() {
  return <>
    <CollectionView />
    <div className={styles.shell}><GalleryManagement /></div>
  </>
}
