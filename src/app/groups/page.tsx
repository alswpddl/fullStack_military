'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { normalizeInviteCode, validateGroupName } from '@/lib/duty';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

type MyGroup = { id: string; name: string; role: 'admin' | 'member' };

// group_members 한 행에 groups 가 붙어서 온다.
type MembershipRow = {
  role: 'admin' | 'member';
  groups: { id: string; name: string } | null;
};

export default function GroupsPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [groups, setGroups] = useState<MyGroup[]>([]);
  const [fetching, setFetching] = useState(true);
  const [name, setName] = useState('');
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!session) return;

    getSupabase()
      .from('group_members')
      .select('role, groups(id, name)')
      .eq('user_id', session.user.id)
      .then(({ data, error: err }) => {
        if (err) {
          setError(err.message);
        } else {
          const rows = (data ?? []) as unknown as MembershipRow[];
          setGroups(
            rows
              .filter((r) => r.groups)
              .map((r) => ({ id: r.groups!.id, name: r.groups!.name, role: r.role })),
          );
        }
        setFetching(false);
      });
  }, [session]);

  async function handleCreate(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setError('');

    const problem = validateGroupName(name);
    if (problem) {
      setError(problem);
      return;
    }

    setBusy(true);
    const { data, error: err } = await getSupabase()
      .from('groups')
      .insert({ name: name.trim(), owner_id: session.user.id })
      .select('id')
      .single();
    setBusy(false);

    if (err || !data) {
      setError(err?.message ?? '그룹을 만들지 못했어요.');
      return;
    }
    router.push(`/groups/${data.id}`);
  }

  async function handleJoin(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');

    const normalized = normalizeInviteCode(code);
    if (!normalized) {
      setError('초대 코드를 입력해 주세요.');
      return;
    }

    setBusy(true);
    const { data, error: err } = await getSupabase().rpc('join_group', { code: normalized });
    setBusy(false);

    if (err) {
      setError(
        err.message.includes('invalid invite code')
          ? '초대 코드가 올바르지 않아요.'
          : err.message,
      );
      return;
    }
    router.push(`/groups/${data}`);
  }

  if (loading || (session && fetching)) return <p>불러오는 중...</p>;
  if (!session) return null;

  return (
    <>
      <div className="topbar">
        <h1>그룹</h1>
        <Link href="/">홈으로</Link>
      </div>

      <div className="card">
        <strong>내 그룹</strong>
        {groups.length === 0 ? (
          <p className="hint">아직 속한 그룹이 없어요. 아래에서 만들거나 초대 코드로 참여하세요.</p>
        ) : (
          <ul className="rows">
            {groups.map((g) => (
              <li key={g.id}>
                <Link href={`/groups/${g.id}`}>{g.name}</Link>
                <span className="hint">{g.role === 'admin' ? '관리자' : '구성원'}</span>
              </li>
            ))}
          </ul>
        )}
      </div>

      <form className="card form" onSubmit={handleJoin}>
        <strong>초대 코드로 참여</strong>
        <label htmlFor="code">초대 코드</label>
        <input
          id="code"
          type="text"
          autoCapitalize="characters"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
        <button type="submit" disabled={busy}>
          참여
        </button>
      </form>

      <form className="card form" onSubmit={handleCreate}>
        <strong>새 그룹 만들기</strong>
        <label htmlFor="group-name">그룹 이름</label>
        <input
          id="group-name"
          type="text"
          maxLength={30}
          value={name}
          onChange={(e) => setName(e.target.value)}
        />
        <p className="hint">실제 부대명이나 위치는 쓰지 말고, 구성원끼리 알아볼 이름으로 지으세요.</p>
        <button type="submit" disabled={busy}>
          만들기
        </button>
      </form>

      {error && <p className="error">{error}</p>}
    </>
  );
}
