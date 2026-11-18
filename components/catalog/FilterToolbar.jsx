import { Filter } from '@carbon/icons-react'
import styles from '@/app/catalog/Catalog.module.css'

export default function FilterToolbar({ label, count = 0, destination, children }) {
  return <div className={styles.filterToolbar}>
    <div className={styles.destination}>{destination}</div>
    <details className={styles.filterDisclosure}>
      <summary><Filter size={16} aria-hidden="true" /> {label}{count > 0 && <span> ({count})</span>}</summary>
      <div className={styles.filterGrid}>{children}</div>
    </details>
  </div>
}
