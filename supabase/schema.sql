-- 군 생활 도우미: Supabase(PostgreSQL) 스키마
-- Supabase 대시보드의 SQL Editor에 통째로 붙여 넣어 한 번 실행한다.
-- 순서: 테이블 -> 보조 함수 -> 트리거 -> RLS 정책 -> Realtime

-- =========================================================
-- 1. 테이블
-- =========================================================

create table public.profiles (
  id             uuid primary key references auth.users (id) on delete cascade,
  nickname       text not null unique check (char_length(nickname) between 1 and 20),
  enlist_date    date,
  service_months int check (service_months between 1 and 36),
  created_at     timestamptz not null default now()
);

create table public.groups (
  id          uuid primary key default gen_random_uuid(),
  name        text not null check (char_length(name) between 1 and 30),
  invite_code text not null unique
              default upper(substr(replace(gen_random_uuid()::text, '-', ''), 1, 8)),
  owner_id    uuid not null references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table public.group_members (
  group_id  uuid not null references public.groups (id) on delete cascade,
  user_id   uuid not null references public.profiles (id) on delete cascade,
  role      text not null default 'member' check (role in ('admin', 'member')),
  joined_at timestamptz not null default now(),
  primary key (group_id, user_id)
);

create table public.events (
  id         uuid primary key default gen_random_uuid(),
  user_id    uuid not null references public.profiles (id) on delete cascade,
  type       text not null check (type in ('leave', 'overnight', 'outing', 'etc')),
  title      text not null check (char_length(title) between 1 and 50),
  start_date date not null,
  end_date   date not null,
  visibility text not null default 'private' check (visibility in ('private', 'group')),
  memo       text check (char_length(memo) <= 500),
  created_at timestamptz not null default now(),
  check (end_date >= start_date)
);

create table public.duty_assignments (
  id          uuid primary key default gen_random_uuid(),
  group_id    uuid not null references public.groups (id) on delete cascade,
  duty_date   date not null,
  duty_name   text not null check (char_length(duty_name) between 1 and 30),
  shift_type  text not null default 'etc' check (shift_type in ('day', 'night', 'etc')),
  assignee_id uuid not null references public.profiles (id) on delete cascade,
  created_by  uuid references public.profiles (id),
  created_at  timestamptz not null default now()
);

create table public.duty_requests (
  id           uuid primary key default gen_random_uuid(),
  group_id     uuid not null references public.groups (id) on delete cascade,
  user_id      uuid not null references public.profiles (id) on delete cascade,
  request_date date not null,
  shift_type   text not null check (shift_type in ('day', 'night', 'off')),
  status       text not null default 'requested'
               check (status in ('requested', 'approved', 'rejected')),
  memo         text check (char_length(memo) <= 100),
  created_at   timestamptz not null default now(),
  unique (group_id, user_id, request_date)
);

create index on public.group_members (user_id);
create index on public.events (user_id, start_date);
create index on public.duty_assignments (group_id, duty_date);
create index on public.duty_requests (group_id, request_date);

-- =========================================================
-- 2. 보조 함수 (RLS 정책에서 쓰는 권한 확인용)
--    security definer: 정책이 group_members를 다시 조회할 때 생기는
--    무한 재귀를 막기 위해 RLS를 거치지 않고 조회한다.
-- =========================================================

create or replace function public.is_group_member(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid()
  );
$$;

create or replace function public.is_group_admin(gid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = auth.uid() and role = 'admin'
  );
$$;

create or replace function public.shares_group_with(uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1
    from public.group_members a
    join public.group_members b on a.group_id = b.group_id
    where a.user_id = auth.uid() and b.user_id = uid
  );
$$;

-- 특정 사용자가 그 그룹 구성원인지 (근무 담당자가 구성원인지 확인할 때 쓴다)
create or replace function public.is_member_of(gid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.group_members
    where group_id = gid and user_id = uid
  );
$$;

-- 특정 사용자가 그 그룹을 만든 사람인지
create or replace function public.is_group_owner(gid uuid, uid uuid)
returns boolean
language sql stable security definer set search_path = public
as $$
  select exists (
    select 1 from public.groups
    where id = gid and owner_id = uid
  );
$$;

-- 초대 코드로 그룹에 참여한다. 클라이언트가 group_members에 직접 insert하지 못하게 하고
-- 이 함수로만 참여하게 해서, 코드를 모르면 들어올 수 없게 한다.
create or replace function public.join_group(code text)
returns uuid
language plpgsql security definer set search_path = public
as $$
declare
  gid uuid;
begin
  if auth.uid() is null then
    raise exception 'login required';
  end if;

  select id into gid from public.groups where invite_code = upper(trim(code));
  if gid is null then
    raise exception 'invalid invite code';
  end if;

  insert into public.group_members (group_id, user_id, role)
  values (gid, auth.uid(), 'member')
  on conflict do nothing;

  return gid;
end;
$$;

revoke all on function public.join_group(text) from public, anon;
grant execute on function public.join_group(text) to authenticated;

-- =========================================================
-- 3. 트리거
-- =========================================================

-- 가입하면 profiles 행을 자동으로 만든다. 닉네임은 가입 때 user metadata로 받는다.
create or replace function public.handle_new_user()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.profiles (id, nickname)
  values (
    new.id,
    coalesce(nullif(trim(new.raw_user_meta_data ->> 'nickname'), ''),
             'user_' || substr(new.id::text, 1, 8))
  );
  return new;
end;
$$;

create trigger on_auth_user_created
  after insert on auth.users
  for each row execute function public.handle_new_user();

-- 그룹을 만들면 만든 사람을 관리자로 자동 등록한다.
create or replace function public.handle_new_group()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  insert into public.group_members (group_id, user_id, role)
  values (new.id, new.owner_id, 'admin');
  return new;
end;
$$;

create trigger on_group_created
  after insert on public.groups
  for each row execute function public.handle_new_group();

-- 그룹에서 나가거나 내보내지면 그 사람의 희망 신청과 근무 배정을 그 그룹에서 지운다.
create or replace function public.handle_member_removed()
returns trigger
language plpgsql security definer set search_path = public
as $$
begin
  delete from public.duty_requests
    where group_id = old.group_id and user_id = old.user_id;
  delete from public.duty_assignments
    where group_id = old.group_id and assignee_id = old.user_id;
  return old;
end;
$$;

create trigger on_group_member_removed
  after delete on public.group_members
  for each row execute function public.handle_member_removed();

-- =========================================================
-- 4. RLS 정책 (모든 테이블에 켠다)
-- =========================================================

alter table public.profiles         enable row level security;
alter table public.groups           enable row level security;
alter table public.group_members    enable row level security;
alter table public.events           enable row level security;
alter table public.duty_assignments enable row level security;
alter table public.duty_requests    enable row level security;

-- profiles: 본인 + 같은 그룹 구성원의 닉네임만 읽고, 수정은 본인만
create policy profiles_select on public.profiles
  for select to authenticated
  using (id = auth.uid() or public.shares_group_with(id));

create policy profiles_update on public.profiles
  for update to authenticated
  using (id = auth.uid())
  with check (id = auth.uid());

-- groups: 소속 구성원만 읽고, 만든 사람만 수정·삭제
create policy groups_select on public.groups
  for select to authenticated
  using (public.is_group_member(id) or owner_id = auth.uid());

create policy groups_insert on public.groups
  for insert to authenticated
  with check (owner_id = auth.uid());

create policy groups_update on public.groups
  for update to authenticated
  using (owner_id = auth.uid())
  with check (owner_id = auth.uid());

create policy groups_delete on public.groups
  for delete to authenticated
  using (owner_id = auth.uid());

-- group_members: 같은 그룹 구성원만 읽고, 탈퇴는 본인, 내보내기는 관리자
-- 그룹을 만든 사람은 나가거나 내보내질 수 없다. (그룹을 없애려면 groups 를 삭제한다)
-- 참여는 join_group 함수로만 가능하므로 insert 정책은 만들지 않는다.
create policy group_members_select on public.group_members
  for select to authenticated
  using (public.is_group_member(group_id));

create policy group_members_delete on public.group_members
  for delete to authenticated
  using (
    (user_id = auth.uid() or public.is_group_admin(group_id))
    and not public.is_group_owner(group_id, user_id)
  );

-- events: 본인 일정 전체 + 같은 그룹 구성원이 'group'으로 공개한 일정, 쓰기는 본인만
create policy events_select on public.events
  for select to authenticated
  using (
    user_id = auth.uid()
    or (visibility = 'group' and public.shares_group_with(user_id))
  );

create policy events_insert on public.events
  for insert to authenticated
  with check (user_id = auth.uid());

create policy events_update on public.events
  for update to authenticated
  using (user_id = auth.uid())
  with check (user_id = auth.uid());

create policy events_delete on public.events
  for delete to authenticated
  using (user_id = auth.uid());

-- duty_assignments: 구성원은 읽기만, 쓰기는 그룹 관리자만
create policy duty_assignments_select on public.duty_assignments
  for select to authenticated
  using (public.is_group_member(group_id));

create policy duty_assignments_insert on public.duty_assignments
  for insert to authenticated
  with check (
    public.is_group_admin(group_id) and public.is_member_of(group_id, assignee_id)
  );

create policy duty_assignments_update on public.duty_assignments
  for update to authenticated
  using (public.is_group_admin(group_id))
  with check (
    public.is_group_admin(group_id) and public.is_member_of(group_id, assignee_id)
  );

create policy duty_assignments_delete on public.duty_assignments
  for delete to authenticated
  using (public.is_group_admin(group_id));

-- duty_requests: 구성원은 읽기, 본인 신청만 작성·수정(상태는 'requested'만),
-- 승인·반려는 그룹 관리자만
create policy duty_requests_select on public.duty_requests
  for select to authenticated
  using (public.is_group_member(group_id));

create policy duty_requests_insert on public.duty_requests
  for insert to authenticated
  with check (
    user_id = auth.uid()
    and public.is_group_member(group_id)
    and status = 'requested'
  );

create policy duty_requests_update on public.duty_requests
  for update to authenticated
  using (
    public.is_group_admin(group_id)
    or (user_id = auth.uid() and status = 'requested')
  )
  with check (
    public.is_group_admin(group_id)
    or (user_id = auth.uid() and public.is_group_member(group_id) and status = 'requested')
  );

create policy duty_requests_delete on public.duty_requests
  for delete to authenticated
  using (user_id = auth.uid() or public.is_group_admin(group_id));

-- 로그인한 사용자(authenticated)에게만 테이블 권한을 준다. 비로그인(anon)에게는 주지 않는다.
-- 어떤 행을 읽고 쓸 수 있는지는 위의 RLS 정책이 정한다.
grant select, insert, update, delete on
  public.profiles, public.groups, public.group_members,
  public.events, public.duty_assignments, public.duty_requests
to authenticated;

-- =========================================================
-- 5. Realtime (변경 사항이 다른 사람 화면에 바로 나타나게 한다)
--    구독도 위의 RLS를 따르므로 권한 없는 행은 전달되지 않는다.
-- =========================================================

alter publication supabase_realtime
  add table public.duty_requests, public.duty_assignments, public.events;
