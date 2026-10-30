import { redirect } from 'next/navigation'

// La configuración de Series en portada ahora vive en Admin > Home.
// La edición de cada serie sigue en /admin/series/[id].
export default function AdminSeriesPage() {
  redirect('/admin/home')
}
