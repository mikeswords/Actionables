create extension if not exists pgcrypto;

create table if not exists public.profiles (
  id uuid primary key references auth.users (id) on delete cascade,
  email text not null unique,
  display_name text not null,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.households (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  join_code text not null unique check (char_length(trim(join_code)) between 6 and 16),
  created_by uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now())
);

create table if not exists public.household_members (
  household_id uuid not null references public.households (id) on delete cascade,
  user_id uuid not null references public.profiles (id) on delete cascade unique,
  role text not null default 'member' check (role in ('owner', 'member')),
  created_at timestamptz not null default timezone('utc', now()),
  primary key (household_id, user_id)
);

create table if not exists public.lists (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(trim(name)) between 1 and 80),
  scope text not null check (scope in ('private', 'shared')),
  accent text not null default 'terracotta' check (accent in ('terracotta', 'forest', 'ocean', 'sand', 'berry')),
  household_id uuid references public.households (id) on delete cascade,
  owner_user_id uuid not null references public.profiles (id) on delete cascade,
  created_at timestamptz not null default timezone('utc', now()),
  constraint list_scope_household_check check (
    (scope = 'private' and household_id is null)
    or
    (scope = 'shared' and household_id is not null)
  )
);

create table if not exists public.tasks (
  id uuid primary key default gen_random_uuid(),
  list_id uuid not null references public.lists (id) on delete cascade,
  title text not null check (char_length(trim(title)) between 1 and 160),
  notes text not null default '',
  status text not null default 'open' check (status in ('open', 'done')),
  due_date date,
  assigned_user_id uuid references public.profiles (id) on delete set null,
  created_by_user_id uuid not null references public.profiles (id) on delete cascade,
  completed_at timestamptz,
  created_at timestamptz not null default timezone('utc', now())
);

create index if not exists idx_household_members_user_id on public.household_members (user_id);
create index if not exists idx_lists_owner_user_id on public.lists (owner_user_id);
create index if not exists idx_lists_household_id on public.lists (household_id);
create index if not exists idx_tasks_list_id on public.tasks (list_id);
create index if not exists idx_tasks_due_date on public.tasks (due_date);
create index if not exists idx_tasks_assigned_user_id on public.tasks (assigned_user_id);

create or replace function public.is_household_member(p_household_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members
    where household_id = p_household_id
      and user_id = auth.uid()
  );
$$;

create or replace function public.share_household_with(p_user_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.household_members mine
    join public.household_members theirs
      on theirs.household_id = mine.household_id
    where mine.user_id = auth.uid()
      and theirs.user_id = p_user_id
  );
$$;

create or replace function public.can_access_list(p_list_id uuid)
returns boolean
language sql
security definer
stable
set search_path = public
as $$
  select exists (
    select 1
    from public.lists l
    where l.id = p_list_id
      and (
        (l.scope = 'private' and l.owner_user_id = auth.uid())
        or
        (l.scope = 'shared' and public.is_household_member(l.household_id))
      )
  );
$$;

create or replace function public.create_household_with_owner(p_name text, p_join_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
begin
  if v_uid is null then
    raise exception 'You must be signed in to create a household.';
  end if;

  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'This account already belongs to a household.';
  end if;

  insert into public.households (name, join_code, created_by)
  values (trim(p_name), upper(trim(p_join_code)), v_uid)
  returning * into v_household;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, v_uid, 'owner');

  return v_household;
end;
$$;

create or replace function public.join_household_by_code(p_join_code text)
returns public.households
language plpgsql
security definer
set search_path = public
as $$
declare
  v_uid uuid := auth.uid();
  v_household public.households;
begin
  if v_uid is null then
    raise exception 'You must be signed in to join a household.';
  end if;

  if exists (select 1 from public.household_members where user_id = v_uid) then
    raise exception 'This account already belongs to a household.';
  end if;

  select *
  into v_household
  from public.households
  where join_code = upper(trim(p_join_code))
  limit 1;

  if v_household.id is null then
    raise exception 'No household was found for that join code.';
  end if;

  insert into public.household_members (household_id, user_id, role)
  values (v_household.id, v_uid, 'member');

  return v_household;
end;
$$;

alter table public.profiles enable row level security;
alter table public.households enable row level security;
alter table public.household_members enable row level security;
alter table public.lists enable row level security;
alter table public.tasks enable row level security;

drop policy if exists "profiles_select_household" on public.profiles;
create policy "profiles_select_household"
on public.profiles
for select
to authenticated
using (
  id = auth.uid()
  or public.share_household_with(id)
);

drop policy if exists "profiles_insert_self" on public.profiles;
create policy "profiles_insert_self"
on public.profiles
for insert
to authenticated
with check (id = auth.uid());

drop policy if exists "profiles_update_self" on public.profiles;
create policy "profiles_update_self"
on public.profiles
for update
to authenticated
using (id = auth.uid())
with check (id = auth.uid());

drop policy if exists "households_select_members" on public.households;
create policy "households_select_members"
on public.households
for select
to authenticated
using (public.is_household_member(id));

drop policy if exists "household_members_select_members" on public.household_members;
create policy "household_members_select_members"
on public.household_members
for select
to authenticated
using (public.is_household_member(household_id));

drop policy if exists "lists_select_accessible" on public.lists;
create policy "lists_select_accessible"
on public.lists
for select
to authenticated
using (
  (scope = 'private' and owner_user_id = auth.uid())
  or
  (scope = 'shared' and public.is_household_member(household_id))
);

drop policy if exists "lists_insert_accessible" on public.lists;
create policy "lists_insert_accessible"
on public.lists
for insert
to authenticated
with check (
  owner_user_id = auth.uid()
  and (
    (scope = 'private' and household_id is null)
    or
    (scope = 'shared' and public.is_household_member(household_id))
  )
);

drop policy if exists "lists_update_accessible" on public.lists;
create policy "lists_update_accessible"
on public.lists
for update
to authenticated
using (
  (scope = 'private' and owner_user_id = auth.uid())
  or
  (scope = 'shared' and public.is_household_member(household_id))
)
with check (
  (scope = 'private' and owner_user_id = auth.uid() and household_id is null)
  or
  (scope = 'shared' and public.is_household_member(household_id))
);

drop policy if exists "lists_delete_accessible" on public.lists;
create policy "lists_delete_accessible"
on public.lists
for delete
to authenticated
using (
  (scope = 'private' and owner_user_id = auth.uid())
  or
  (scope = 'shared' and public.is_household_member(household_id))
);

drop policy if exists "tasks_select_accessible" on public.tasks;
create policy "tasks_select_accessible"
on public.tasks
for select
to authenticated
using (public.can_access_list(list_id));

drop policy if exists "tasks_insert_accessible" on public.tasks;
create policy "tasks_insert_accessible"
on public.tasks
for insert
to authenticated
with check (
  created_by_user_id = auth.uid()
  and public.can_access_list(list_id)
);

drop policy if exists "tasks_update_accessible" on public.tasks;
create policy "tasks_update_accessible"
on public.tasks
for update
to authenticated
using (public.can_access_list(list_id))
with check (public.can_access_list(list_id));

drop policy if exists "tasks_delete_accessible" on public.tasks;
create policy "tasks_delete_accessible"
on public.tasks
for delete
to authenticated
using (public.can_access_list(list_id));

grant usage on schema public to authenticated;
grant select, insert, update on public.profiles to authenticated;
grant select on public.households to authenticated;
grant select on public.household_members to authenticated;
grant select, insert, update, delete on public.lists to authenticated;
grant select, insert, update, delete on public.tasks to authenticated;
grant execute on function public.is_household_member(uuid) to authenticated;
grant execute on function public.share_household_with(uuid) to authenticated;
grant execute on function public.can_access_list(uuid) to authenticated;
grant execute on function public.create_household_with_owner(text, text) to authenticated;
grant execute on function public.join_household_by_code(text) to authenticated;
