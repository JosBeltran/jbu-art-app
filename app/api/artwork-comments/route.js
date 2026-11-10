import { serviceClient, HttpError } from '@/lib/certificates/adminAuth.server'
import { commentBody, commentContext, commentPage, commentRpc, commentsResponse, commentUser, publicCommentIdentity, requirePublicCommentContext } from '@/lib/artworkComments.server'
import { discussionId } from '@/lib/artworkDiscussion'

export function GET(request) {
  return commentsResponse(async () => {
    const params = new URL(request.url).searchParams
    const context = commentContext(params.get('artwork'), params.get('context'))
    const thread = params.get('thread')
    if (thread && !discussionId(thread)) throw new HttpError(400, 'invalid_action')
    await requirePublicCommentContext(context)
    const db = serviceClient()
    const user = await commentUser(request, db)
    return commentRpc(db, 'read_artwork_discussion', {
      ...context, _viewer: user?.id || null, _page: commentPage(params.get('page')), _thread: thread || null,
    })
  })
}

export function POST(request) {
  return commentsResponse(async () => {
    const db = serviceClient()
    const user = await commentUser(request, db, true)
    const input = await request.json().catch(() => null)
    if (input?.action === 'report') {
      if (!discussionId(input.id) || !['spam', 'abuse', 'other'].includes(input.reason)) throw new HttpError(400, 'invalid_report')
      const { data, error } = await db.from('artwork_comments').select('artwork_id,context_kind,context_ref')
        .eq('id', input.id).eq('moderation_status', 'APPROVED').maybeSingle()
      if (error) throw error
      if (!data) throw new HttpError(400, 'invalid_report')
      await requirePublicCommentContext({ _art: data.artwork_id, _kind: data.context_kind, _ref: data.context_ref })
      await commentRpc(db, 'report_artwork_comment', { _user: user.id, _id: input.id, _reason: input.reason })
      return { reported: true }
    }
    if (input?.action !== 'submit' || (input.parent && !discussionId(input.parent))) throw new HttpError(400, 'invalid_action')
    const context = commentContext(input.artwork, input.context)
    const body = commentBody(input.body)
    await requirePublicCommentContext(context)
    return commentRpc(db, 'submit_artwork_comment', {
      ...context, ...publicCommentIdentity(user, input.name), _user: user.id, _parent: input.parent || null, _body: body,
    })
  })
}
