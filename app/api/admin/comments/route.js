import { z } from 'zod'
import { requireCertificateAdmin, serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { commentBody, commentContext, commentPage, commentRpc, commentsResponse, requirePublicCommentContext } from '@/lib/artworkComments.server'
import { discussionId } from '@/lib/artworkDiscussion'

const statuses = ['PENDING', 'APPROVED', 'REJECTED', 'HIDDEN', 'DELETED', 'REPORTED', 'ALL']
const participantStates = ['AUTO', 'TRUSTED', 'REVIEW_REQUIRED', 'RESTRICTED', 'BLOCKED']
const settings = z.strictObject({
  enabled: z.boolean(), auto_publish: z.boolean(), mandatory_review: z.boolean(), allow_links: z.boolean(),
  notifications_enabled: z.boolean(), allow_replies: z.boolean(), allow_display_name: z.boolean(),
  trust_threshold: z.number().int().min(1).max(50), max_length: z.number().int().min(100).max(4000),
  rate_limit: z.number().int().min(1).max(30),
  risk_patterns: z.array(z.string().trim().min(1).max(80)).max(20),
})

function admin(request, operation) {
  return commentsResponse(async () => {
    const { user } = await requireCertificateAdmin(request)
    return operation(serviceClient(), user.id)
  })
}

function dataOf(result) {
  if (result.error) throw result.error
  return result.data
}

export function GET(request) {
  return admin(request, async db => {
    const query = new URL(request.url).searchParams
    const view = query.get('view')
    const page = commentPage(query.get('page'))
    if (view === 'count') {
      const result = await db.from('artwork_comments').select('id', { count: 'exact', head: true }).eq('moderation_status', 'PENDING')
      if (result.error) throw result.error
      return { pending: result.count || 0 }
    }
    if (view === 'settings') {
      const sku = query.get('sku')?.trim().slice(0, 150)
      const config = dataOf(await db.from('artwork_comment_settings').select(Object.keys(settings.shape).join(',')).eq('id', true).single())
      if (!sku) return { config }
      const artwork = dataOf(await db.from('artworks').select('id,sku,title').eq('sku', sku).maybeSingle())
      const override = artwork && dataOf(await db.from('artwork_comment_overrides').select('enabled').eq('artwork_id', artwork.id).maybeSingle())
      return { config, artwork, enabled: override?.enabled ?? true }
    }
    if (view === 'participants') {
      const state = query.get('state') || 'ALL'
      if (state !== 'ALL' && !participantStates.includes(state)) throw new HttpError(400, 'invalid_action')
      return commentRpc(db, 'list_comment_participants', {
        _state: state, _page: page, _search: (query.get('q') || '').trim().slice(0, 150),
      })
    }
    if (view === 'history') {
      const id = query.get('id')
      const participant = query.get('participant')
      if (!discussionId(id || participant)) throw new HttpError(400, 'invalid_action')
      const rows = dataOf(await db.from('artwork_comment_audit').select('action,details,created_at,comment_id')
        .eq(id ? 'comment_id' : 'participant_id', id || participant).order('id', { ascending: false }).limit(100))
      return { history: rows }
    }
    const id = query.get('comment')
    const status = query.get('status') || 'PENDING'
    if ((id && !discussionId(id)) || !statuses.includes(status)) throw new HttpError(400, 'invalid_action')
    return commentRpc(db, 'list_admin_artwork_comments', {
      _status: status, _search: (query.get('q') || '').trim().slice(0, 150), _page: page, _id: id || null,
    })
  })
}

export function POST(request) {
  return admin(request, async (db, actor) => {
    const input = await request.json().catch(() => null)
    if (input?.action === 'settings') {
      if (input.artwork && (!discussionId(input.artwork) || typeof input.enabled !== 'boolean'))
        throw new HttpError(400, 'invalid_action')
      const parsed = settings.safeParse(input.settings)
      if (!input.artwork && !parsed.success) throw new HttpError(400, 'invalid_action')
      await commentRpc(db, 'save_artwork_comment_settings', {
        _actor: actor, _art: input.artwork || null, _data: input.artwork ? { enabled: input.enabled } : parsed.data,
      })
      return { saved: true }
    }
    if (input?.action === 'participant') {
      if (!discussionId(input.user) || !participantStates.includes(input.state)) throw new HttpError(400, 'invalid_action')
      await commentRpc(db, 'set_comment_participant_state', { _actor: actor, _user: input.user, _state: input.state })
      return { saved: true }
    }
    if (input?.action === 'studio') {
      if (input.parent && !discussionId(input.parent)) throw new HttpError(400, 'invalid_action')
      const context = commentContext(input.artwork, input.context)
      await requirePublicCommentContext(context)
      return commentRpc(db, 'submit_artwork_comment', {
        ...context, _user: actor, _parent: input.parent || null, _body: commentBody(input.body),
        _name: null, _avatar: null, _custom: null, _studio: true, _note: input.note === true,
      })
    }
    if (!['approve', 'reject', 'hide', 'delete', 'pin', 'unpin', 'review_reports'].includes(input?.action) ||
      !Array.isArray(input.ids) || input.ids.length < 1 || input.ids.length > 50 || input.ids.some(id => !discussionId(id)) ||
      (input.reason != null && (typeof input.reason !== 'string' || input.reason.length > 400)))
      throw new HttpError(400, 'invalid_action')
    const changed = await commentRpc(db, 'moderate_artwork_comments', {
      _actor: actor, _ids: [...new Set(input.ids)], _action: input.action, _reason: input.reason?.trim() || null,
    })
    return { changed }
  })
}
