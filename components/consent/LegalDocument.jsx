'use client'
import { InfoShell, InfoSections } from '@/app/info/InfoPage'
import { legalDocuments } from '@/data/legalDocuments'
export default function LegalDocument({ document }) {
 const content = legalDocuments[document]
 if (!content) return null
 return <InfoShell label={['JBU · Legal', 'JBU · Legal']} title={content.title} intro={content.intro} updated={[`Versión ${content.version}`, `Version ${content.version}`]}><InfoSections sections={content.sections}/></InfoShell>
}
