'use client'

import styles from './MobileBottomNav.module.css'

/**
 * Barra inferior móvil compartida (público, coleccionista y admin).
 * Solo se muestra por debajo de 48rem; escritorio y tablet no cambian.
 *
 * @param {{ ariaLabel: string, items: Array<{ key: string, label: string, icon: any, href?: string, onClick?: () => void, active?: boolean, badge?: number, ariaLabel?: string, expanded?: boolean }> }} props
 */
export default function MobileBottomNav({ ariaLabel, items }) {
  return (
    <nav className={styles.bar} aria-label={ariaLabel} style={{ gridTemplateColumns: `repeat(${items.length}, minmax(0, 1fr))` }}>
      {items.map(({ key, label, icon: Icon, href, onClick, active, badge, ariaLabel: itemLabel, expanded }) => {
        const content = (
          <>
            <span className={styles.iconWrap}>
              <Icon size={20} aria-hidden="true" />
              {badge > 0 && <span className={styles.badge} aria-hidden="true">{badge}</span>}
            </span>
            <span className={styles.label}>{label}</span>
          </>
        )
        if (href) {
          return (
            <a key={key} href={href} className={styles.item} aria-current={active ? 'page' : undefined} aria-label={itemLabel}>
              {content}
            </a>
          )
        }
        return (
          <button key={key} type="button" onClick={onClick} className={styles.item} aria-label={itemLabel} aria-expanded={expanded} data-active={active ? 'true' : undefined}>
            {content}
          </button>
        )
      })}
    </nav>
  )
}
