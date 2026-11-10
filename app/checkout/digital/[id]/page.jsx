import DigitalReceipt from './DigitalReceipt'

export const metadata = {
  title: 'JBU Digital Downloads',
  robots: { index: false, follow: false },
  referrer: 'no-referrer',
}

export default async function DigitalReceiptPage({ params }) {
  const { id } = await params
  return <DigitalReceipt key={id} purchaseId={id} />
}
