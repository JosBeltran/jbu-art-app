export function publicCollectionNavigation(t) {
  return [
    { key: 'catalog', label: t('Obras', 'Artworks'), href: '/catalog' },
    { key: 'prints', label: t('Prints', 'Prints'), href: '/prints' },
    { key: 'about', label: t('Acerca de', 'About'), href: '/about' },
  ]
}
