begin;

-- Strip the old generated labels from historical artwork titles in both languages.
with suffix(pattern) as (
  values ($regex$(?:[[:space:]]*·(?:[[:space:]]|&#x20;)*#)?(?:[[:space:]]*·(?:[[:space:]]|&#x20;)*(?:versi[oó]n anterior|earlier version|previous version))+(?:[[:space:]]|&#x20;)*$$regex$)
), cleaned as (
  select id,
    case when title ~* pattern then coalesce(nullif(btrim(regexp_replace(title, pattern, '', 'i')), ''), title) else title end as title,
    case when title_en ~* pattern then coalesce(nullif(btrim(regexp_replace(title_en, pattern, '', 'i')), ''), title_en) else title_en end as title_en
  from public.artworks
  cross join suffix
  where is_historical_version
    and (title ~* pattern or title_en ~* pattern)
)
update public.artworks as artwork
set title = cleaned.title,
    title_en = cleaned.title_en
from cleaned
where artwork.id = cleaned.id
  and (artwork.title, artwork.title_en) is distinct from (cleaned.title, cleaned.title_en);

commit;
