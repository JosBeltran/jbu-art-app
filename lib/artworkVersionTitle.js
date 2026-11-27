const legacySuffix = /(?:\s*·(?:\s|&#x20;)*#)?(?:\s*·(?:\s|&#x20;)*(?:versi[oó]n anterior|earlier version|previous version))+(?:\s|&#x20;)*$/iu

export function removeLegacyArtworkVersionSuffix(title) {
  return title.replace(legacySuffix, '').trim() || title.trim()
}

export function cleanArtworkVersionTitle(title) {
  const base = title.replace(/(?:\s*·\s*V[0-9]+)+\s*$/iu, '')
  return removeLegacyArtworkVersionSuffix(base) || title.trim()
}
