import { redirect } from 'next/navigation'

// La configuración del Hero ahora vive en Admin > Home.
export default function AdminHeroPage() {
  redirect('/admin/home')
}
