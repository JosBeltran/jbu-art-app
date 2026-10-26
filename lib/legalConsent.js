export const TERMS_VERSION = '1.0'
export const PRIVACY_VERSION = '1.0'
export function signupConsent(accepted) {
  if (accepted !== true) throw new Error('LEGAL_CONSENT_REQUIRED')
  return { accepted: true, terms_version: TERMS_VERSION, privacy_version: PRIVACY_VERSION }
}
export function hasCurrentLegalConsent(row) {
  return Boolean(row?.terms_accepted_at && row?.privacy_accepted_at && row.terms_version === TERMS_VERSION && row.privacy_version === PRIVACY_VERSION)
}
export function isGoogleUser(user) {
  return user?.app_metadata?.provider === 'google' || user?.app_metadata?.providers?.includes('google') === true
}
