import { createClient } from '@supabase/supabase-js'
import { bearerToken, HttpError } from './certificates/adminAuth.server.js'
import { discussionId, parseDiscussion } from './artworkDiscussion.js'

const errors = {
  invalid_action: 400, invalid_body: 400, invalid_display_name: 400, invalid_reply: 400,
  invalid_report: 400, links_disabled: 409, invalid_participant: 404, invalid_context: 404,
  forbidden: 403, participant_blocked: 403, comments_disabled: 409, comment_rate_limited: 429,
}
const responseHeaders = { 'Cache-Control': 'private, no-store' }

export async function commentsResponse(operation) {
  try {
    return Response.json(await operation(), { headers: responseHeaders })
  } catch (error) {
    const code = error instanceof HttpError ? error.code : error?.message
    const status = error instanceof HttpError ? error.status : Object.hasOwn(errors, code) ? errors[code] : 503
    if (status === 503) console.error('[comments]', error?.code || error?.name)
    return Response.json({ error: status === 503 ? 'comments_unavailable' : code }, { status, headers: responseHeaders })
  }
}

export async function commentRpc(db, name, args) {
  const result = await db.rpc(name, args)
  if (result.error) throw result.error
  return result.data
}

export async function commentUser(request, db, required = false) {
  const token = bearerToken(request)
  if (token) {
    const { data, error } = await db.auth.getUser(token)
    if (!error && data?.user && !data.user.is_anonymous && (data.user.email_confirmed_at || data.user.confirmed_at))
      return data.user
  }
  if (required) throw new HttpError(401, 'unauthorized')
  return null
}

export function commentPage(value) {
  const page = Number(value || 1)
  if (!Number.isInteger(page) || page < 1 || page > 10000) throw new HttpError(400, 'invalid_action')
  return page
}

export function commentContext(artworkId, value) {
  const context = parseDiscussion(value ?? 'artwork')
  if (!discussionId(artworkId) || !context) throw new HttpError(400, 'invalid_context')
  return { _art: artworkId, _kind: context.kind, _ref: context.ref }
}

export async function requirePublicCommentContext(context) {
  // The public role preserves the existing artwork, gallery and provenance permissions.
  const client = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY,
    { auth: { persistSession: false, autoRefreshToken: false } })
  if (!await commentRpc(client, 'comment_context_public', context)) throw new HttpError(404, 'invalid_context')
}

function safeDisplayName(value) {
  if (typeof value !== 'string') return null
  const name = value.normalize('NFKC').replace(/[\p{Cc}\p{Cf}<>]/gu, '').trim()
  if (!name || name.length > 60 || name.includes('@') || name.replace(/[^a-z]/gi, '').toLowerCase().startsWith('jbustudio')) return null
  return name
}

export function publicCommentIdentity(user, custom) {
  const google = user.identities?.find(identity => identity.provider === 'google')?.identity_data
  const name = safeDisplayName(google?.full_name || google?.name || user.user_metadata?.full_name || user.user_metadata?.name)
  let avatar = null
  try {
    const url = new URL(google?.avatar_url || google?.picture)
    if (url.protocol === 'https:' && !url.username && !url.password && !url.port &&
      /^lh[0-9]+\.googleusercontent\.com$/.test(url.hostname) && !url.search && !url.hash)
      avatar = url.href
  } catch { /* A neutral avatar is used when Google has no usable photo. */ }
  if (custom != null && typeof custom !== 'string') throw new HttpError(400, 'invalid_display_name')
  const publicName = custom == null ? null : custom.trim() ? safeDisplayName(custom) : ''
  if (custom?.trim() && !publicName) throw new HttpError(400, 'invalid_display_name')
  return { _name: name, _avatar: avatar, _custom: publicName }
}

export function commentBody(value) {
  if (typeof value !== 'string') throw new HttpError(400, 'invalid_body')
  // HTML is kept as literal text for moderation, never interpreted in the UI.
  const body = value.replace(/\r\n?/g, '\n').replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f\u007f\p{Cf}]/gu, '').trim()
  if (!body || body.length > 4000 || /[^\s@]+@[^\s@]+\.[^\s@]+/.test(body))
    throw new HttpError(400, 'invalid_body')
  return body
}
