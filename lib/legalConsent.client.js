import { supabase } from '@/lib/supabaseClient'
import { hasCurrentLegalConsent, isGoogleUser } from './legalConsent'
import { artworkDiscussionDestination } from './artworkDiscussion'
import { safeRedirectPath } from './authRedirect'
export async function consentDestination(user, destination) {
  const next = safeRedirectPath(destination, '/profile')
  if (!isGoogleUser(user) || artworkDiscussionDestination(next)) return next
  const { data, error } = await supabase.rpc('get_my_legal_consent')
  return !error && hasCurrentLegalConsent(data?.[0]) ? next : `/consent?next=${encodeURIComponent(next)}`
}
