-- Additive, transactional: no historical acceptances are fabricated.
BEGIN;
CREATE TABLE public.user_legal_consents (
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  terms_accepted_at timestamptz NOT NULL DEFAULT now(),
  privacy_accepted_at timestamptz NOT NULL DEFAULT now(),
  terms_version text NOT NULL,
  privacy_version text NOT NULL,
  acceptance_source text NOT NULL CHECK (acceptance_source IN ('EMAIL_SIGNUP', 'AUTHENTICATED')),
  PRIMARY KEY (user_id, terms_version, privacy_version)
);
GRANT SELECT ON public.user_legal_consents TO authenticated;
GRANT ALL ON public.user_legal_consents TO service_role;
ALTER TABLE public.user_legal_consents ENABLE ROW LEVEL SECURITY;
CREATE POLICY legal_consent_own_read ON public.user_legal_consents FOR SELECT TO authenticated USING (user_id = auth.uid());
-- No direct client INSERT/UPDATE: server timestamps and versions cannot be forged via table writes.
CREATE FUNCTION public.get_my_legal_consent()
RETURNS SETOF public.user_legal_consents LANGUAGE sql STABLE SECURITY DEFINER SET search_path = '' AS $$
  SELECT * FROM public.user_legal_consents WHERE user_id = auth.uid() AND terms_version = '1.0' AND privacy_version = '1.0';
$$;
REVOKE ALL ON FUNCTION public.get_my_legal_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.get_my_legal_consent() TO authenticated;
CREATE FUNCTION public.accept_current_legal_consent()
RETURNS SETOF public.user_legal_consents LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
BEGIN
  IF auth.uid() IS NULL THEN RAISE EXCEPTION 'AUTH_REQUIRED'; END IF;
  INSERT INTO public.user_legal_consents(user_id, terms_version, privacy_version, acceptance_source)
  VALUES (auth.uid(), '1.0', '1.0', 'AUTHENTICATED') ON CONFLICT DO NOTHING;
  RETURN QUERY SELECT * FROM public.user_legal_consents WHERE user_id = auth.uid() AND terms_version = '1.0' AND privacy_version = '1.0';
END;
$$;
REVOKE ALL ON FUNCTION public.accept_current_legal_consent() FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.accept_current_legal_consent() TO authenticated;
CREATE FUNCTION public.record_signup_legal_consent()
RETURNS trigger LANGUAGE plpgsql SECURITY DEFINER SET search_path = '' AS $$
DECLARE evidence jsonb := NEW.raw_user_meta_data -> 'legal_consent';
BEGIN
  -- Google accounts complete consent after the provider validates identity. Other providers are unchanged.
  IF COALESCE(NEW.raw_app_meta_data ->> 'provider', 'email') <> 'email' THEN RETURN NEW; END IF;
  IF evidence IS NULL OR evidence -> 'accepted' IS DISTINCT FROM 'true'::jsonb
    OR evidence ->> 'terms_version' IS DISTINCT FROM '1.0'
    OR evidence ->> 'privacy_version' IS DISTINCT FROM '1.0' THEN
    RAISE EXCEPTION 'LEGAL_CONSENT_REQUIRED';
  END IF;
  INSERT INTO public.user_legal_consents(user_id, terms_version, privacy_version, acceptance_source)
  VALUES (NEW.id, '1.0', '1.0', 'EMAIL_SIGNUP');
  RETURN NEW;
END;
$$;
REVOKE ALL ON FUNCTION public.record_signup_legal_consent() FROM PUBLIC, anon, authenticated;
CREATE TRIGGER jbu_record_signup_legal_consent AFTER INSERT ON auth.users FOR EACH ROW EXECUTE FUNCTION public.record_signup_legal_consent();
COMMIT;
