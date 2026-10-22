-- 20261031_user_roles.sql
-- Roles en tabla separada (nunca en profiles/users). Requerida por la
-- autorización server-side de certificados y del Admin collector preview.

create type public.app_role as enum ('admin', 'moderator', 'user');

create table public.user_roles (
    id uuid primary key default gen_random_uuid(),
    user_id uuid references auth.users(id) on delete cascade not null,
    role public.app_role not null,
    unique (user_id, role)
);

-- Acceso Data API: solo lectura para usuarios autenticados; service_role total.
grant select on public.user_roles to authenticated;
grant all on public.user_roles to service_role;

alter table public.user_roles enable row level security;

-- Cada usuario solo puede leer sus propios roles.
create policy "Users can read their own roles"
on public.user_roles
for select
to authenticated
using (auth.uid() = user_id);

-- Comprobación de rol sin recursión de RLS (security definer).
create or replace function public.has_role(_user_id uuid, _role public.app_role)
returns boolean
language sql
stable
security definer
set search_path = public
as $$
  select exists (
    select 1
    from public.user_roles
    where user_id = _user_id
      and role = _role
  )
$$;

-- Alta inicial del administrador (idempotente). Perfil/cuenta confirmados:
-- d6700fed-08c6-4434-9ebd-1c5bfb10bf24 (Josue Beltran Uresti).
insert into public.user_roles (user_id, role)
values ('d6700fed-08c6-4434-9ebd-1c5bfb10bf24', 'admin')
on conflict (user_id, role) do nothing;
