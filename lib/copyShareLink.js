export async function copyShareLink(url) {
  if (navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(url); return } catch { /* try the browser fallback */ }
  }
  const previousFocus = document.activeElement
  const input = document.createElement('input')
  input.value = url
  input.style.position = 'fixed'
  input.style.opacity = '0'
  input.readOnly = true
  document.body.appendChild(input)
  try {
    input.select()
    if (!document.execCommand('copy')) throw new Error('copy_failed')
  } finally {
    input.remove()
    previousFocus?.focus?.()
  }
}
