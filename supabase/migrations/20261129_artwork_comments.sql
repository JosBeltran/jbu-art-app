begin;

create table public.artwork_comment_settings (
  id boolean primary key default true check (id),
  enabled boolean not null default true,
  trust_threshold integer not null default 2 check (trust_threshold between 1 and 50),
  auto_publish boolean not null default true,
  mandatory_review boolean not null default false,
  max_length integer not null default 1200 check (max_length between 100 and 4000),
  rate_limit integer not null default 5 check (rate_limit between 1 and 30),
  allow_links boolean not null default false,
  notifications_enabled boolean not null default true,
  allow_replies boolean not null default true,
  allow_display_name boolean not null default true,
  risk_patterns text[] not null default '{}' check (cardinality(risk_patterns) <= 20)
);
insert into public.artwork_comment_settings default values;

create table public.artwork_comment_overrides (
  artwork_id uuid primary key references public.artworks(id) on delete cascade,
  enabled boolean not null
);

create table public.artwork_comment_participants (
  user_id uuid primary key references auth.users(id) on delete cascade,
  state text not null default 'AUTO' check (state in ('AUTO','TRUSTED','REVIEW_REQUIRED','RESTRICTED','BLOCKED')),
  public_display_name text check (char_length(public_display_name) between 1 and 60),
  trust_since timestamptz not null default now(),
  updated_at timestamptz not null default now()
);

create table public.artwork_comments (
  id uuid primary key default gen_random_uuid(),
  artwork_id uuid not null references public.artworks(id) on delete cascade,
  context_kind text not null check (context_kind in ('artwork','primary','gallery','legacy','provenance','event','print')),
  context_ref text not null default '' check (char_length(context_ref) <= 1600),
  parent_comment_id uuid references public.artwork_comments(id) on delete cascade,
  author_user_id uuid references auth.users(id) on delete set null,
  author_display_name text not null check (char_length(author_display_name) between 1 and 60),
  author_avatar_url text,
  artist boolean not null default false,
  pinned boolean not null default false check (not pinned or artist),
  artist_note boolean not null default false check (not artist_note or artist),
  body text not null check (char_length(body) <= 4000),
  moderation_status text not null check (moderation_status in ('PENDING','APPROVED','REJECTED','HIDDEN','DELETED')),
  moderation_reason text check (char_length(moderation_reason) <= 400),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  approved_at timestamptz,
  approved_by uuid references auth.users(id) on delete set null,
  check ((context_kind in ('artwork','primary')) = (context_ref = '')),
  check ((moderation_status = 'DELETED') = (body = ''))
);
create index artwork_comment_context_idx on public.artwork_comments (artwork_id, context_kind, md5(context_ref), created_at desc, id);
create index artwork_comment_author_idx on public.artwork_comments (author_user_id, created_at desc);
create index artwork_comment_queue_idx on public.artwork_comments (moderation_status, created_at desc);
create index artwork_comment_parent_idx on public.artwork_comments (parent_comment_id, created_at);

create table public.artwork_comment_reports (
  id uuid primary key default gen_random_uuid(),
  comment_id uuid not null references public.artwork_comments(id) on delete cascade,
  reporter_id uuid references auth.users(id) on delete set null,
  reason text not null check (reason in ('spam','abuse','other')),
  created_at timestamptz not null default now(),
  reviewed_at timestamptz,
  reviewed_by uuid references auth.users(id) on delete set null,
  unique(comment_id, reporter_id)
);
create index artwork_comment_report_queue_idx on public.artwork_comment_reports (comment_id) where reviewed_at is null;
create index artwork_comment_report_user_idx on public.artwork_comment_reports (reporter_id, created_at desc);

create table public.artwork_comment_audit (
  id bigint generated always as identity primary key,
  comment_id uuid references public.artwork_comments(id) on delete set null,
  artwork_id uuid references public.artworks(id) on delete set null,
  participant_id uuid references auth.users(id) on delete set null,
  actor_id uuid references auth.users(id) on delete set null,
  action text not null,
  details jsonb not null default '{}',
  created_at timestamptz not null default now()
);
create index artwork_comment_audit_comment_idx on public.artwork_comment_audit (comment_id, id desc);
create index artwork_comment_audit_participant_idx on public.artwork_comment_audit (participant_id, id desc);

-- Use the public role for this context check before privileged application reads.
-- Context validation applies the same discovery rules as historical versions.
create function public.comment_context_public(_art uuid,_kind text,_ref text)
returns boolean language sql stable security invoker set search_path=public as $$
 select exists (
   select 1 from artworks_discoverable a
   where a.id=_art and (a.version_kind is distinct from 'SUCCESSOR' or a.version_published_at is not null)
     and (not a.is_historical_version or exists(select 1 from public_artwork_versions(a.id) v where not v.is_historical_version))
     and case _kind
       when 'artwork' then _ref=''
       when 'primary' then _ref='' and nullif(a.primary_image_url,'') is not null
       when 'legacy' then exists(select 1 from jsonb_array_elements_text(
         case when jsonb_typeof(to_jsonb(a)->'secondary_images')='array' then to_jsonb(a)->'secondary_images' else '[]'::jsonb end
       ) u where u=_ref)
       when 'gallery' then exists(select 1 from artwork_images i where i.id=case when _ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then _ref::uuid end
         and i.artwork_id=a.id and coalesce(i.media_type,'image') <> 'video' and nullif(i.image_url,'') is not null)
       when 'provenance' then exists(select 1 from provenance_event_images_public i where i.id=case when _ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then _ref::uuid end
         and i.artwork_id=a.id and nullif(i.image_url,'') is not null)
       when 'event' then exists(select 1 from artwork_provenance_public e where e.id=case when _ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then _ref::uuid end
         and e.artwork_id=a.id and nullif(e.primary_image_url,'') is not null)
       when 'print' then a.allows_prints is true and exists(select 1 from artwork_prints p where p.id=case when _ref ~* '^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$' then _ref::uuid end
         and p.artwork_id=a.id and p.is_active)
       else false end
 );
$$;
revoke all on function public.comment_context_public(uuid,text,text) from public;
grant execute on function public.comment_context_public(uuid,text,text) to anon,authenticated,service_role;

-- Private identity, risk decisions, reports and settings never appear in a
-- browser table projection. The service uses explicit, limited projections.
do $$ declare t text; begin
 foreach t in array array['artwork_comment_settings','artwork_comment_overrides','artwork_comment_participants',
   'artwork_comments','artwork_comment_reports','artwork_comment_audit'] loop
   execute format('alter table public.%I enable row level security',t);
   execute format('revoke all on public.%I from public,anon,authenticated',t);
   execute format('grant select on public.%I to service_role',t);
 end loop;
end $$;

create function public.comment_notify(_comment uuid,_event text) returns void
language plpgsql security definer set search_path=public as $$
declare recipient uuid; es text; en text;
begin
 if not (select notifications_enabled from artwork_comment_settings where id) then return; end if;
 es:=case _event when 'report' then 'Se reportó un comentario' when 'warning' then 'Comentario de participante de confianza requiere revisión' else 'Comentario pendiente de aprobación' end;
 en:=case _event when 'report' then 'A comment was reported' when 'warning' then 'A trusted participant comment needs review' else 'Comment awaiting approval' end;
 for recipient in select distinct user_id from user_roles where role::text='admin' loop
   perform enqueue_notification(recipient,null,'COMMENT_MODERATION','COMMENT',_comment::text,
     'comment:'||_comment||':'||_event||':'||recipient,'/admin/comments?comment='||_comment,es,en);
 end loop;
end $$;

create function public.comment_contains_link(_body text) returns boolean
language sql immutable strict set search_path=public as $$
 select _body ~* '(https?://|ftp://|www[.]|javascript:|data:[[:space:]]*text/|[[:alnum:]-]+[.](com|net|org|xyz|io|mx|ru|ly|co|top)([^[:alpha:]]|$))';
$$;

create function public.submit_artwork_comment(_user uuid,_art uuid,_kind text,_ref text,_parent uuid,_body text,
 _name text,_avatar text,_custom text,_studio boolean default false,_note boolean default false) returns jsonb
language plpgsql security definer set search_path=public as $$
declare cfg artwork_comment_settings; participant artwork_comment_participants; parent artwork_comments;
 saved artwork_comments; clean text:=btrim(_body); approved boolean; trusted boolean; risk text;
begin
 select * into cfg from artwork_comment_settings where id;
 if not cfg.enabled or exists(select 1 from artwork_comment_overrides where artwork_id=_art and not enabled) then raise exception 'comments_disabled'; end if;
 if not comment_context_public(_art,_kind,_ref) then raise exception 'invalid_context'; end if;
 if clean is null or char_length(clean) not between 1 and cfg.max_length then raise exception 'invalid_body'; end if;
 if _studio and not exists(select 1 from user_roles where user_id=_user and role::text='admin') then raise exception 'forbidden'; end if;
 if not _studio then
   -- Serialize per identity before counting posts or evaluating trust.
   perform pg_advisory_xact_lock(hashtextextended(_user::text,2911));
   select * into participant from artwork_comment_participants where user_id=_user;
   if participant.state='BLOCKED' then raise exception 'participant_blocked'; end if;
   if (select count(*) from artwork_comments where author_user_id=_user and created_at>now()-interval '10 minutes')>=cfg.rate_limit then
     raise exception 'comment_rate_limited';
   end if;
 end if;

 if _parent is not null then
   select * into parent from artwork_comments where id=_parent for share;
   if not (cfg.allow_replies or _studio) or not found or parent.parent_comment_id is not null
     or parent.moderation_status<>'APPROVED' or (parent.artwork_id,parent.context_kind,parent.context_ref) is distinct from (_art,_kind,_ref)
     then raise exception 'invalid_reply'; end if;
 end if;

 if not _studio then
   insert into artwork_comment_participants(user_id,public_display_name) values(_user,case when cfg.allow_display_name then nullif(_custom,'') end)
   on conflict(user_id) do update set
     public_display_name=case when cfg.allow_display_name and _custom is not null then nullif(_custom,'')
       else artwork_comment_participants.public_display_name end, updated_at=now()
   returning * into participant;
   trusted := participant.state='TRUSTED' or (participant.state='AUTO' and (
     select count(*) from artwork_comments where author_user_id=_user and not artist and moderation_status='APPROVED'
       and approved_by is not null and approved_at>=participant.trust_since
   )>=cfg.trust_threshold);
   risk := case
     when clean ~* '<[[:space:]]*[/!?a-z]|&(#0*60|#x0*3c|lt);' then 'html'
     when comment_contains_link(clean)
       and (not cfg.allow_links or clean ~* '(javascript:|data:|ftp://|xn--|bit[.]ly|tinyurl[.]|t[.]co|[.]xyz|[.]top)') then 'link'
     when clean ~* '(crypto giveaway|guaranteed profit|contact me on telegram|(.)\2{11,})'
       or exists(select 1 from unnest(cfg.risk_patterns) term where term<>'' and strpos(lower(clean),lower(term))>0) then 'spam'
     when exists(select 1 from artwork_comments where author_user_id=_user and created_at>now()-interval '1 day'
       and lower(regexp_replace(body,'[[:space:]]+',' ','g'))=lower(regexp_replace(clean,'[[:space:]]+',' ','g'))) then 'duplicate'
     when (select count(*) from artwork_comments where author_user_id=_user and created_at>now()-interval '1 minute')>=2 then 'frequency'
   end;
   approved := cfg.auto_publish and not cfg.mandatory_review and coalesce(trusted,false) and risk is null;
 else approved:=true;
 end if;

 insert into artwork_comments(artwork_id,context_kind,context_ref,parent_comment_id,author_user_id,
   author_display_name,author_avatar_url,artist,artist_note,body,moderation_status,moderation_reason,approved_at,approved_by)
 values(_art,_kind,_ref,_parent,_user,
   case when _studio then 'JBU Studio' else coalesce(case when cfg.allow_display_name then participant.public_display_name end,_name,'Participante') end,
   case when not _studio then _avatar end,_studio,_studio and _note,clean,
   case when approved then 'APPROVED' else 'PENDING' end,risk,case when approved then now() end,case when _studio then _user end)
 returning * into saved;
 if not approved then
   perform comment_notify(saved.id,case when trusted and risk is not null then 'warning' else 'pending' end);
 end if;
 if _studio then
   insert into artwork_comment_audit(comment_id,artwork_id,actor_id,action) values(saved.id,_art,_user,'STUDIO_REPLY');
 end if;
 return jsonb_build_object('id',saved.id,'status',saved.moderation_status);
end $$;

create function public.report_artwork_comment(_user uuid,_id uuid,_reason text) returns void
language plpgsql security definer set search_path=public as $$
declare c artwork_comments;
begin
 perform pg_advisory_xact_lock(hashtextextended(_user::text,2911));
 if exists(select 1 from artwork_comment_participants where user_id=_user and state='BLOCKED') then raise exception 'participant_blocked'; end if;
 if (select count(*) from artwork_comment_reports where reporter_id=_user and created_at>now()-interval '1 hour')>=10 then raise exception 'comment_rate_limited'; end if;
 select * into c from artwork_comments where id=_id and moderation_status='APPROVED' for share;
 if not found or c.author_user_id=_user or not comment_context_public(c.artwork_id,c.context_kind,c.context_ref)
   or exists(select 1 from artwork_comments p where p.id=c.parent_comment_id and p.moderation_status<>'APPROVED')
   or not (select enabled from artwork_comment_settings where id)
   or exists(select 1 from artwork_comment_overrides where artwork_id=c.artwork_id and not enabled) then raise exception 'invalid_report'; end if;
 insert into artwork_comment_reports(comment_id,reporter_id,reason) values(_id,_user,_reason) on conflict do nothing;
 if found then perform comment_notify(_id,'report'); end if;
end $$;

create function public.read_artwork_discussion(_viewer uuid,_art uuid,_kind text,_ref text,_page integer,_thread uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
 with cfg as (
   select s.*, s.enabled and not exists(select 1 from artwork_comment_overrides where artwork_id=_art and not enabled) as visible
   from artwork_comment_settings s where s.id
 ), scoped as (
   select c.* from artwork_comments c,cfg where cfg.visible and c.artwork_id=_art and c.context_kind=_kind
     and md5(c.context_ref)=md5(_ref) and c.context_ref=_ref
     and (c.moderation_status='APPROVED' or (c.moderation_status='PENDING' and c.author_user_id=_viewer))
 ), roots as (
   select c.* from scoped c where c.parent_comment_id is not distinct from _thread
     and (_thread is null or exists(select 1 from scoped p where p.id=_thread and p.moderation_status='APPROVED' and p.parent_comment_id is null))
   order by pinned desc, created_at desc,id desc offset greatest(0,_page-1)*20 limit 21
 ), safe as (
   select c.id,c.parent_comment_id,c.author_display_name,c.author_avatar_url,c.artist,c.pinned,c.artist_note,c.body,
     c.moderation_status,c.created_at,coalesce(c.author_user_id=_viewer,false) as mine
   from scoped c
 )
 select jsonb_build_object('enabled',cfg.visible,'maxLength',cfg.max_length,'allowReplies',cfg.allow_replies,
   'allowDisplayName',cfg.allow_display_name,'allowLinks',cfg.allow_links,
   'displayName',(select public_display_name from artwork_comment_participants where user_id=_viewer),
   'hasMore',(select count(*)>20 from roots),
   'comments',coalesce((select jsonb_agg(to_jsonb(s) || jsonb_build_object('replyCount',(
       select count(*) from safe reply where reply.parent_comment_id=s.id
     )) order by r.pinned desc,r.created_at desc,r.id desc)
     from (select * from roots limit 20) r join safe s using(id)), '[]'::jsonb)) from cfg;
$$;

create function public.moderate_artwork_comments(_actor uuid,_ids uuid[],_action text,_reason text default null)
returns integer language plpgsql security definer set search_path=public as $$
declare c artwork_comments; target uuid; next_status text; changed integer:=0;
begin
 if not exists(select 1 from user_roles where user_id=_actor and role::text='admin') then raise exception 'forbidden'; end if;
 if coalesce(cardinality(_ids),0) not between 1 and 50 or _action not in ('approve','reject','hide','delete','pin','unpin','review_reports')
   or (cardinality(_ids)>1 and _action not in ('approve','reject')) or char_length(_reason)>400 then raise exception 'invalid_action'; end if;
 -- Match posting's identity lock order so trust cannot race with moderation.
 for target in select distinct author_user_id from artwork_comments where id=any(_ids) and not artist and author_user_id is not null order by author_user_id loop
   perform pg_advisory_xact_lock(hashtextextended(target::text,2911));
 end loop;
 for c in select * from artwork_comments where id=any(_ids) order by id for update loop
   if c.moderation_status='DELETED' and _action<>'review_reports' then continue; end if;
   if _action='review_reports' then
     update artwork_comment_reports set reviewed_at=now(),reviewed_by=_actor where comment_id=c.id and reviewed_at is null;
     if not found then continue; end if;
   elsif _action in ('pin','unpin') then
     if not c.artist or c.moderation_status<>'APPROVED' or c.parent_comment_id is not null then raise exception 'invalid_action'; end if;
     update artwork_comments set pinned=(_action='pin'),updated_at=now() where id=c.id and pinned is distinct from (_action='pin');
     if not found then continue; end if;
   else
     if cardinality(_ids)>1 and c.moderation_status<>'PENDING' then continue; end if;
     if _action='approve' and c.author_user_id=_actor and not c.artist then raise exception 'forbidden'; end if;
     if _action='approve' and not c.artist and comment_contains_link(c.body)
       and not (select allow_links from artwork_comment_settings where id) then raise exception 'links_disabled'; end if;
     next_status:=case _action when 'approve' then 'APPROVED' when 'reject' then 'REJECTED' when 'hide' then 'HIDDEN' else 'DELETED' end;
     if c.moderation_status=next_status then continue; end if;
     update artwork_comments set moderation_status=next_status,moderation_reason=_reason,updated_at=now(),
       approved_by=case when next_status='APPROVED' then _actor end,approved_at=case when next_status='APPROVED' then now() end,
       pinned=false,artist_note=case when _action='delete' then false else artist_note end,
       author_user_id=case when _action='delete' then null else author_user_id end,
       author_display_name=case when _action='delete' then '—' else author_display_name end,
       author_avatar_url=case when _action='delete' then null else author_avatar_url end,
       body=case when _action='delete' then '' else body end where id=c.id;
     if _action='reject' and not c.artist and c.author_user_id is not null then
       insert into artwork_comment_participants(user_id,state) values(c.author_user_id,'REVIEW_REQUIRED')
       on conflict(user_id) do update set state='REVIEW_REQUIRED',updated_at=now()
         where artwork_comment_participants.state in ('AUTO','TRUSTED');
     end if;
   end if;
   insert into artwork_comment_audit(comment_id,artwork_id,participant_id,actor_id,action,details)
   values(c.id,c.artwork_id,case when _action<>'delete' then c.author_user_id end,_actor,upper(_action),
     jsonb_build_object('previous',c.moderation_status,'reason',_reason));
   changed:=changed+1;
 end loop;
 return changed;
end $$;

create function public.set_comment_participant_state(_actor uuid,_user uuid,_state text)
returns void language plpgsql security definer set search_path=public as $$
declare previous text;
begin
 if not exists(select 1 from user_roles where user_id=_actor and role::text='admin') then raise exception 'forbidden'; end if;
 if _actor=_user or _state not in ('AUTO','TRUSTED','REVIEW_REQUIRED','RESTRICTED','BLOCKED') then raise exception 'invalid_action'; end if;
 perform pg_advisory_xact_lock(hashtextextended(_user::text,2911));
 select state into previous from artwork_comment_participants where user_id=_user;
 if previous is null then raise exception 'invalid_participant'; end if;
 update artwork_comment_participants set state=_state,updated_at=now(),
   trust_since=case when _state='AUTO' then now() else trust_since end where user_id=_user;
 insert into artwork_comment_audit(participant_id,actor_id,action,details)
 values(_user,_actor,'PARTICIPANT_STATE',jsonb_build_object('previous',previous,'state',_state));
end $$;

create function public.save_artwork_comment_settings(_actor uuid,_data jsonb,_art uuid default null)
returns void language plpgsql security definer set search_path=public as $$
declare s artwork_comment_settings;
begin
 if not exists(select 1 from user_roles where user_id=_actor and role::text='admin') then raise exception 'forbidden'; end if;
 if _art is null then
   select * into s from artwork_comment_settings where id for update;
   s:=jsonb_populate_record(s,_data);
   update artwork_comment_settings set enabled=s.enabled,trust_threshold=s.trust_threshold,auto_publish=s.auto_publish,
     mandatory_review=s.mandatory_review,max_length=s.max_length,rate_limit=s.rate_limit,allow_links=s.allow_links,
     notifications_enabled=s.notifications_enabled,allow_replies=s.allow_replies,allow_display_name=s.allow_display_name,
     risk_patterns=s.risk_patterns where id;
 else
   if jsonb_typeof(_data->'enabled') is distinct from 'boolean' then raise exception 'invalid_action'; end if;
   insert into artwork_comment_overrides(artwork_id,enabled) values(_art,(_data->>'enabled')::boolean)
     on conflict(artwork_id) do update set enabled=excluded.enabled;
 end if;
 insert into artwork_comment_audit(artwork_id,actor_id,action,details) values(_art,_actor,'SETTINGS',_data);
end $$;

create function public.list_admin_artwork_comments(_status text,_search text,_page integer,_id uuid default null)
returns jsonb language sql stable security definer set search_path=public as $$
 with matching as (
   select c.*,a.sku,a.title as artwork_title,
     (select state from artwork_comment_participants p where p.user_id=c.author_user_id) as participant_state,
     coalesce((select jsonb_agg(jsonb_build_object('reason',r.reason,'created_at',r.created_at,'reviewed_at',r.reviewed_at)
       order by r.created_at desc) from artwork_comment_reports r where r.comment_id=c.id),'[]'::jsonb) as reports,
     case c.context_kind
       when 'primary' then a.primary_image_url
       when 'legacy' then c.context_ref
       when 'gallery' then (select i.image_url from artwork_images i where i.id::text=c.context_ref and i.artwork_id=c.artwork_id)
       when 'provenance' then (select i.image_url from provenance_event_images_public i where i.id::text=c.context_ref and i.artwork_id=c.artwork_id)
       when 'event' then (select e.primary_image_url from artwork_provenance_public e where e.id::text=c.context_ref and e.artwork_id=c.artwork_id)
       when 'print' then (select p.image_url from artwork_prints p where p.id::text=c.context_ref and p.artwork_id=c.artwork_id)
     end as context_image,
     case when c.context_kind='print' then (select p.size from artwork_prints p where p.id::text=c.context_ref and p.artwork_id=c.artwork_id) end as print_size
   from artwork_comments c join artworks a on a.id=c.artwork_id
   where (_id is null or c.id=_id) and (_id is not null or _status='ALL'
     or (_status='REPORTED' and exists(select 1 from artwork_comment_reports r where r.comment_id=c.id and r.reviewed_at is null))
     or c.moderation_status=_status)
     and (_search='' or strpos(lower(concat_ws(' ',c.author_display_name,c.body,a.sku,a.title)),lower(_search))>0)
   order by c.created_at desc,c.id desc offset greatest(0,_page-1)*25 limit 26
 )
 select jsonb_build_object('hasMore',(select count(*)>25 from matching),'comments',coalesce((
   select jsonb_agg(to_jsonb(m) order by m.created_at desc,m.id desc) from (select * from matching limit 25) m
 ),'[]'::jsonb));
$$;

create function public.list_comment_participants(_state text,_page integer,_search text)
returns jsonb language sql stable security definer set search_path=public as $$
 with matching as (
   select p.user_id,p.state,p.public_display_name,p.updated_at,latest.author_display_name as author_name,latest.author_avatar_url as avatar
   from artwork_comment_participants p
   left join lateral (
     select c.author_display_name,c.author_avatar_url from artwork_comments c where c.author_user_id=p.user_id and not c.artist
     order by c.created_at desc,c.id desc limit 1
   ) latest on true
   where (_state='ALL' or p.state=_state) and (_search='' or strpos(lower(concat_ws(' ',
     p.public_display_name,latest.author_display_name,p.user_id::text)),lower(_search))>0)
   order by p.updated_at desc,p.user_id offset greatest(0,_page-1)*25 limit 26
 )
 select jsonb_build_object('hasMore',(select count(*)>25 from matching),'participants',coalesce((
   select jsonb_agg(to_jsonb(m) order by m.updated_at desc,m.user_id) from (select * from matching limit 25) m
 ),'[]'::jsonb));
$$;

-- Auth deletion removes the identity and avatar from previously public posts.
create function public.anonymize_deleted_comment_author() returns trigger language plpgsql set search_path=public as $$
begin
 if old.author_user_id is not null and new.author_user_id is null and not old.artist then
   new.author_display_name:=case when new.moderation_status='DELETED' then '—' else 'Participante' end;
   new.author_avatar_url:=null;
 end if;
 return new;
end $$;
create trigger anonymize_deleted_comment_author before update of author_user_id on public.artwork_comments
for each row execute function public.anonymize_deleted_comment_author();

revoke all on function public.comment_notify(uuid,text), public.comment_contains_link(text),
  public.submit_artwork_comment(uuid,uuid,text,text,uuid,text,text,text,text,boolean,boolean),
  public.report_artwork_comment(uuid,uuid,text),
  public.read_artwork_discussion(uuid,uuid,text,text,integer,uuid),
  public.moderate_artwork_comments(uuid,uuid[],text,text),
  public.set_comment_participant_state(uuid,uuid,text),
  public.save_artwork_comment_settings(uuid,jsonb,uuid),
  public.list_admin_artwork_comments(text,text,integer,uuid), public.list_comment_participants(text,integer,text)
from public,anon,authenticated;
grant execute on function
  public.submit_artwork_comment(uuid,uuid,text,text,uuid,text,text,text,text,boolean,boolean),
  public.report_artwork_comment(uuid,uuid,text),
  public.read_artwork_discussion(uuid,uuid,text,text,integer,uuid),
  public.moderate_artwork_comments(uuid,uuid[],text,text),
  public.set_comment_participant_state(uuid,uuid,text),
  public.save_artwork_comment_settings(uuid,jsonb,uuid),
  public.list_admin_artwork_comments(text,text,integer,uuid), public.list_comment_participants(text,integer,text)
to service_role;

notify pgrst, 'reload schema';
commit;
