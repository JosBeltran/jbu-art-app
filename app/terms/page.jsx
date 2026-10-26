import LegalDocument from '@/components/consent/LegalDocument'
export const metadata = { title: 'Términos y Condiciones — JBU', description: 'Condiciones de uso y compra de JBU · Estudio JBU.', alternates: { canonical: '/terms' }, openGraph: { title: 'Términos y Condiciones — JBU', description: 'Condiciones de uso y compra de JBU · Estudio JBU.', type: 'website' }, twitter: { card: 'summary', title: 'Términos y Condiciones — JBU', description: 'Condiciones de uso y compra de JBU · Estudio JBU.' } }
export default function Page() { return <LegalDocument document="terms" /> }
