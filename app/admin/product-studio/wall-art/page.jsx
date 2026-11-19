import { redirect } from 'next/navigation'

export default function WallArtShortcut() {
  redirect('/admin/product-studio?provider=gelato')
}
