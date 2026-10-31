-- Global editorial sharing. Reuses the singleton and its existing public-read/Admin-write RLS.
-- No artwork fields, overrides, new tables, prices or permissions changes.
begin;
alter table public.site_settings add column if not exists social_sharing jsonb not null default '{}'::jsonb;
do $$ begin
  alter table public.site_settings add constraint site_social_sharing_object check (jsonb_typeof(social_sharing) = 'object');
exception when duplicate_object then null; end $$;
-- Analytics deliberately retains existing channel contract. New channels do not
-- masquerade as old channels or require a duplicate tracking system.
commit;
