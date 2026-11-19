export const ARTWORK_DISCUSSION = { kind: 'artwork', ref: '' }
const uuid = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
export const discussionId = value => typeof value === 'string' && uuid.test(value)

export function parseDiscussion(value) {
  if (typeof value !== 'string' || value.length > 1612) return null
  if (['artwork', 'primary'].includes(value)) return { kind: value, ref: '' }
  const split = value.indexOf(':')
  if (split < 1) return null
  const kind = value.slice(0, split)
  const ref = value.slice(split + 1)
  if (['gallery', 'provenance', 'event', 'print'].includes(kind) && discussionId(ref)) return { kind, ref: ref.toLowerCase() }
  if (kind === 'legacy' && ref.length > 0 && ref.length <= 1600 && !/[\u0000-\u001f]/.test(ref)) return { kind, ref }
  return null
}

export function discussionKey({ kind, ref }) {
  return ref ? kind + ':' + ref : kind
}

export function artworkDiscussionDestination(path) {
  try {
    const url = new URL(path, 'https://jbu.invalid')
    const context = parseDiscussion(url.searchParams.get('discussion'))
    if (url.origin !== 'https://jbu.invalid' || url.hash !== '#discussion' || !context) return false
    if (/^\/artwork\/[^/]+\/?$/.test(url.pathname)) return true
    return /^\/prints\/[^/]+\/?$/.test(url.pathname) &&
      context.kind === 'print' && url.searchParams.get('variant') === context.ref
  } catch {
    return false
  }
}

export function discussionDraftKey(artworkId, context) {
  return 'jbu:discussion:' + artworkId + ':' + discussionKey(context)
}

const temporaryDrafts = new Map()

export function readDiscussionDraft(storage, artworkId, context) {
  try {
    const draft = JSON.parse(temporaryDrafts.get(discussionDraftKey(artworkId, context)) ?? storage?.getItem(discussionDraftKey(artworkId, context)) ?? null)
    if (typeof draft?.body === 'string') return {
      body: draft.body.slice(0, 4000),
      name: typeof draft.name === 'string' ? draft.name.slice(0, 60) : '',
      reply: discussionId(draft.reply?.id) && typeof draft.reply.name === 'string' ? draft.reply : null,
      useName: draft.useName === true,
    }
  } catch { /* A missing or unavailable draft is an empty editor. */ }
  return { body: '', name: '', reply: null, useName: false }
}

export function writeDiscussionDraft(storage, artworkId, context, draft) {
  const key = discussionDraftKey(artworkId, context)
  const value = draft ? JSON.stringify(draft) : 'null'
  try {
    if (!storage) throw new Error('storage_unavailable')
    if (draft) storage.setItem(key, value)
    else storage.removeItem(key)
    temporaryDrafts.delete(key)
  } catch {
    temporaryDrafts.set(key, value)
  }
}

export function clearDiscussionDestination() {
  const location = new URL(window.location.href)
  if (!location.searchParams.has('discussion') && location.hash !== '#discussion') return
  const context = parseDiscussion(location.searchParams.get('discussion'))
  if (location.pathname.startsWith('/artwork/') && context?.kind === 'print' &&
      location.searchParams.get('print') === context.ref) location.searchParams.delete('print')
  location.searchParams.delete('discussion')
  location.searchParams.delete('photo')
  if (location.hash === '#discussion') location.hash = ''
  window.history.replaceState(null, '', location.pathname + location.search + location.hash)
}
