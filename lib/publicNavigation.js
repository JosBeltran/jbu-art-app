export const COLLECTORS_GALLERY_PATH = '/collectors-gallery'

export function publicCollectionNavigation(t) {
  return [
    { key: 'catalog', label: t('Obras', 'Artworks'), href: '/catalog' },
    { key: 'prints', label: t('Prints', 'Prints'), href: '/prints' },
    { key: 'collectors', label: t('En su nuevo espacio', 'In Their New Home'), href: COLLECTORS_GALLERY_PATH },
    { key: 'about', label: t('Acerca de', 'About'), href: '/about' },
  ]
}
