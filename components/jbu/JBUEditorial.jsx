import styles from './JBUEditorial.module.css'

/** Label editorial pequeño con acento JBU (ej. "OBRAS", "01 — DESCUBRE"). */
export function JBUEditorialLabel({ children, plain = false, as: Tag = 'p', className = '' }) {
  return <Tag className={`${styles.label} ${plain ? styles.labelPlain : ''} ${className}`}>{children}</Tag>
}

/** Encabezado de página con superficie lavanda, igual que el catálogo. */
export function JBUPageHeader({ label, title, intro, children }) {
  return (
    <header className={styles.pageHeader}>
      <div className={styles.pageHeaderInner}>
        <div>
          {label && <JBUEditorialLabel>{label}</JBUEditorialLabel>}
          <h1 className={styles.pageTitle}>{title}</h1>
          {intro && <p className={styles.pageIntro}>{intro}</p>}
        </div>
        {children}
      </div>
    </header>
  )
}

/** Sección editorial con divisor superior, label y título grande. */
export function JBUSection({ id, label, title, intro, children, className = '' }) {
  const titleId = id ? `${id}-title` : undefined
  return (
    <section id={id} className={`${styles.section} ${className}`} aria-labelledby={titleId}>
      {(label || title) && (
        <div className={styles.sectionHead}>
          {label && <JBUEditorialLabel>{label}</JBUEditorialLabel>}
          <div>
            {title && <h2 id={titleId} className={styles.sectionTitle}>{title}</h2>}
            {intro && <p className={styles.sectionIntro} style={{ marginTop: title ? '1rem' : 0 }}>{intro}</p>}
          </div>
        </div>
      )}
      {children}
    </section>
  )
}

/** Lista de pasos con números grandes y divisores. */
export function JBUSteps({ steps }) {
  return (
    <ol className={styles.steps}>
      {steps.map((step) => (
        <li key={step.number} className={styles.step}>
          <span className={styles.stepNumber} aria-hidden="true">{step.number}</span>
          <div>
            {step.kicker && <p className={styles.stepKicker}>{step.kicker}</p>}
            <h3 className={styles.stepTitle}>{step.title}</h3>
          </div>
          <p className={styles.stepText}>{step.text}</p>
        </li>
      ))}
    </ol>
  )
}
