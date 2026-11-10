import { test } from 'node:test'
import assert from 'node:assert/strict'
import { readFile } from 'node:fs/promises'
import { artworkDiscussionDestination, discussionKey, parseDiscussion, readDiscussionDraft, writeDiscussionDraft } from './artworkDiscussion.js'
import { buildArtworkMedia } from './artworkMedia.js'
import { publicCommentIdentity, commentBody } from './artworkComments.server.js'

const image = '10000000-0000-0000-0000-000000000001'
const artwork = '10000000-0000-0000-0000-000000000002'

test('OAuth destination exemption is scoped to an artwork discussion with a valid context', () => {
  assert.equal(artworkDiscussionDestination('/artwork/V1?discussion=gallery%3A' + image + '#discussion'), true)
  for (const path of ['/profile?discussion=artwork#discussion', '/cart?discussion=primary#discussion',
    '//example.com/artwork/V1?discussion=artwork#discussion', '/artwork/V1?discussion=gallery:oops#discussion',
    '/artwork/V1?discussion=artwork#prints']) assert.equal(artworkDiscussionDestination(path), false)
})

test('a draft survives the return, including its reply, while each version and context stays separate', () => {
  const map = new Map()
  const storage = { setItem: (key, value) => map.set(key, value), getItem: key => map.get(key), removeItem: key => map.delete(key) }
  const context = parseDiscussion('gallery:' + image)
  const draft = { body: 'A question', name: 'Visitor', useName: true, reply: { id: image, name: 'Another visitor' } }
  writeDiscussionDraft(storage, artwork, context, draft)
  assert.deepEqual(readDiscussionDraft(storage, artwork, context), draft)
  assert.equal(readDiscussionDraft(storage, image, context).body, '')
  assert.equal(readDiscussionDraft(storage, artwork, parseDiscussion('primary')).body, '')
  writeDiscussionDraft(storage, artwork, context, null)
  assert.equal(readDiscussionDraft(storage, artwork, context).body, '')
})

test('gallery comment identifiers survive sorting and changes to optimized URLs', () => {
  const art = { primary_image_url: '/primary.jpg', secondary_images: ['/same.jpg', '/legacy.jpg'] }
  const first = buildArtworkMedia(art, [{ id: image, image_url: '/same.jpg', display_order: 10 }])
  assert.deepEqual(first.map(item => discussionKey(item.discussion)), ['primary', 'gallery:' + image, 'legacy:/legacy.jpg'])
  const updated = buildArtworkMedia({ ...art, secondary_images: ['/legacy.jpg'] }, [{ id: image, image_url: '/new.webp', display_order: 0 }])
  assert.equal(updated.find(item => item.url === '/new.webp').discussion.ref, image)
})

test('public author projection excludes email and reserves the Studio name', () => {
  const user = { email: 'private@example.test', identities: [{ provider: 'google',
    identity_data: { full_name: 'Visitor', picture: 'https://lh3.googleusercontent.com/avatar' } }] }
  assert.deepEqual(publicCommentIdentity(user), { _name: 'Visitor', _avatar: 'https://lh3.googleusercontent.com/avatar', _custom: null })
  assert.throws(() => publicCommentIdentity(user, 'JBU Studio — Artist'), /invalid_display_name/)
  assert.throws(() => publicCommentIdentity(user, user.email), /invalid_display_name/)
  assert.throws(() => commentBody('Email me at private@example.test'), /invalid_body/)
  assert.equal(commentBody(' <script>x</script> '), '<script>x</script>')
})

test('Tidio is absent from both public client entry points', async () => {
  for (const path of ['../app/ClientLayout.jsx', '../app/artwork/[sku]/ArtworkDetailClient.tsx', '../app/globals.css']) {
    const source = await readFile(new URL(path, import.meta.url), 'utf8')
    assert.doesNotMatch(source, /tidio/i)
  }
})
