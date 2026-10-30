/**
 * Texto del Announcement Banner del sitio público.
 *
 * La configuración vive en la fila única de `site_settings` (migración
 * 20261107_announcement_banner.sql). Sin configuración válida o con el
 * banner desactivado devuelve '' y el banner no ocupa espacio.
 */
export function getAnnouncementText(settings, lang) {
  if (!settings || settings.announcement_enabled !== true) return ''
  const es = String(settings.announcement_text_es || '').trim()
  const en = String(settings.announcement_text_en || '').trim()
  if (lang === 'en' && en) return en
  return es || en
}
