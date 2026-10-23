const TITLE = 'How it works — Collecting original art | Josué Beltrán Uresti'
const DESC = 'How to discover, acquire and manage original contemporary art by Josué Beltrán Uresti: certificates of authenticity, documented provenance and a private collector space.'
export const metadata = {
  title: { absolute: TITLE },
  description: DESC,
  alternates: { canonical: 'https://www.josuebeltranuresti.com/como-funciona' },
  openGraph: { title: TITLE, description: DESC, type: 'website', url: 'https://www.josuebeltranuresti.com/como-funciona' },
  twitter: { card: 'summary_large_image', title: TITLE, description: DESC },
}
export default function Layout({ children }) { return children }
