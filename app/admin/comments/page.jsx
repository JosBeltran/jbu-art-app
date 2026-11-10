import CommentsAdmin from './CommentsAdmin'

export default async function Page({ searchParams }) {
  const { comment } = await searchParams
  return <CommentsAdmin initialComment={typeof comment === 'string' ? comment : ''} />
}
