'use client'

import { useLayoutEffect, useRef, useSyncExternalStore } from 'react'
import { createPortal } from 'react-dom'
import { Theme } from '@carbon/react'
import { useAppTheme } from '@/components/AppThemeProvider'

const subscribe = () => () => {}
const clientSnapshot = () => true
const serverSnapshot = () => false
const stack = []
const inertBefore = new Map()
let overflowBefore
let observer
const focusable = 'button,a[href],input,select,textarea,[tabindex]:not([tabindex="-1"]),video[controls]'
const visible = node => node?.isConnected && !node.closest('[inert]') &&
  !node.disabled && node.getClientRects().length > 0 && getComputedStyle(node).visibility !== 'hidden'

function isolateTopOverlay() {
  const top = stack.at(-1)
  for (const child of document.body.children) {
    if (!inertBefore.has(child)) inertBefore.set(child, child.inert)
    child.inert = top ? !child.contains(top.host) || inertBefore.get(child) : inertBefore.get(child)
  }
}

/** Portal removes header/transform stacking contexts; Carbon Theme restores the
 * semantic variables that a DOM portal cannot inherit from its React parents.
 * Carbon retains its own focus trap. Specialist overlays opt into the same
 * lifecycle with a small focus trap, without replacing their media/cart UI.
 */
/** @param {{open: boolean, children: import('react').ReactNode, onClose?: () => void, carbon?: boolean, initialFocus?: string, theme?: 'g10' | 'g100'}} props */
export default function ThemedOverlay({ open, children, onClose, carbon = false, initialFocus = undefined, theme = undefined }) {
  const mounted = useSyncExternalStore(subscribe, clientSnapshot, serverSnapshot)
  const { dark } = useAppTheme()
  const hostRef = useRef(null)
  const closeRef = useRef(onClose)
  useLayoutEffect(() => { closeRef.current = onClose }, [onClose])
  useLayoutEffect(() => {
    if (!open || !mounted || !hostRef.current) return
    const host = hostRef.current
    const dialog = host.querySelector('[role="dialog"], [role="alertdialog"]')
    if (!dialog) return
    const previousFocus = document.activeElement
    const entry = { host }
    if (!stack.length) {
      overflowBefore = document.body.style.overflow
      observer = new MutationObserver(isolateTopOverlay)
      observer.observe(document.body, { childList: true })
    }
    stack.push(entry)
    document.body.style.overflow = 'hidden'
    isolateTopOverlay()
    const targets = () => Array.from(dialog.querySelectorAll(focusable)).filter(visible)
    const focusFirst = () => {
      const preferred = initialFocus && dialog.querySelector(initialFocus)
      ;(visible(preferred) ? preferred : targets()[0] || dialog).focus({ preventScroll: true })
    }
    // Nested Carbon payment dialogs retain their own keyboard handling. The
    // parent trap must not intercept their Escape or pull focus back underneath.
    const nestedModal = () => Array.from(host.querySelectorAll('.cds--modal.is-visible [role="dialog"]'))
      .some(other => other !== dialog && visible(other))
    const ownsFocus = () => stack.at(-1) === entry && !nestedModal()
    const keydown = event => {
      if (!ownsFocus() || event.defaultPrevented) return
      if (event.key === 'Escape') {
        // An expanded combobox consumes the first Escape to close its list.
        if (carbon && dialog.querySelector('[role=combobox][aria-expanded=true]')) return
        event.preventDefault()
        event.stopPropagation()
        closeRef.current?.()
      } else if (!carbon && event.key === 'Tab') {
        const nodes = targets()
        const first = nodes[0], last = nodes.at(-1)
        if (!first) { event.preventDefault(); dialog.focus() }
        else if (!dialog.contains(document.activeElement) ||
          (event.shiftKey && document.activeElement === first) ||
          (!event.shiftKey && document.activeElement === last)) {
          event.preventDefault()
          ;(event.shiftKey ? last : first).focus()
        }
      }
    }
    const focusin = event => {
      if (ownsFocus() && !host.contains(event.target)) focusFirst()
    }
    document.addEventListener('keydown', keydown, true)
    document.addEventListener('focusin', focusin)
    // Carbon's passive mount focus runs later. selectorPrimaryFocus on each
    // Carbon Modal agrees with this initial target.
    focusFirst()
    return () => {
      document.removeEventListener('keydown', keydown, true)
      document.removeEventListener('focusin', focusin)
      const wasTop = stack.at(-1) === entry
      const index = stack.indexOf(entry)
      if (index !== -1) stack.splice(index, 1)
      isolateTopOverlay()
      if (!stack.length) {
        observer?.disconnect()
        for (const [node, inert] of inertBefore) node.inert = inert
        inertBefore.clear()
        document.body.style.overflow = overflowBefore
      }
      if (wasTop && visible(previousFocus)) previousFocus.focus({ preventScroll: true })
    }
  }, [open, mounted, carbon, initialFocus])

  if (!open || !mounted) return null
  return createPortal(<Theme theme={theme || (dark ? 'g100' : 'g10')} style={{ display: 'contents' }}>
    <div ref={hostRef} data-jbu-overlay style={{ display: 'contents' }}>{children}</div>
  </Theme>, document.body)
}
