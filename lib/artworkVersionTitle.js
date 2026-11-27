const generatedSuffix = /(?:\s*·(?:\s|&#x20;)*#)?(?:\s*·(?:\s|&#x20;)*(?:versi[oó]n anterior|earlier version|previous version))+(?:\s|&#x20;)*$/iu

export function cleanArtworkVersionTitle(title) {
  return title.replace(generatedSuffix, '').trim() || title.trim()
}
