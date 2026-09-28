'use client'

import { InfoShell, InfoSections } from '../InfoPage'

const WA = (name) => `https://wa.me/528123518298?text=${encodeURIComponent(`Hola, me interesa ${name}`)}`

const sets = [
  ['Spiral Bear Duo I — Warm Palette', ['2 cojines de lienzo premium (18"×18" y 16"×16")', '2x premium canvas cushions (18"×18" & 16"×16")']],
  ['Spiral Bear Duo II — Cool Palette', ['2 cojines de lienzo premium (16"×16")', '2x premium canvas cushions (16"×16")']],
]

const sections = [
  ...sets.map(([name, desc]) => ({
    label: ['Set de coleccionista · Edición 2/2', 'Collector set · Edition 2/2'],
    title: [name, name],
    items: [
      [['Contenido', 'Includes'], desc],
      [['Precio', 'Price'], ['$110 USD', '$110 USD']],
    ],
    action: { href: WA(name), external: true, label: ['Consultar', 'Inquire'] },
  })),
  { label: ['Envíos', 'Shipping'], title: ['Solo Estados Unidos', 'US only'], paragraphs: [[
    'Cada Art Object se elabora por lanzamiento. Disponible exclusivamente para envíos dentro de Estados Unidos.',
    'All Art Objects are custom-crafted per release. Available exclusively for US domestic shipping.',
  ]] },
]

export default function ArtObjectsPage() {
  return (
    <InfoShell
      label={['JBU · Lanzamientos de estudio', 'JBU · Studio releases']}
      title={['Art Objects', 'Art Objects']}
      intro={['Piezas funcionales y ediciones limitadas que llevan composiciones expresionistas originales a la vida diaria.', 'Functional art pieces and limited studio releases that bring original expressionist compositions into daily life.']}
    >
      <InfoSections sections={sections} />
    </InfoShell>
  )
}
