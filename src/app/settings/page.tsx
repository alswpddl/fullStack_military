'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

export default function SettingsPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [nickname, setNickname] = useState('');
  const [enlistDate, setEnlistDate] = useState('');
  const [months, setMonths] = useState('');
  const [ready, setReady] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  useEffect(() => {
    if (!session) return;

    getSupabase()
      .from('profiles')
      .select('nickname, enlist_date, service_months')
      .eq('id', session.user.id)
      .single()
      .then(({ data, error: err }) => {
        if (err || !data) {
          setError(err?.message ?? '프로필을 불러오지 못했어요.');
          return;
        }
        setNickname(data.nickname);
        setEnlistDate(data.enlist_date ?? '');
        setMonths(data.service_months ? String(data.service_months) : '');
        setReady(true);
      });
  }, [session]);

  async function handleSave(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!session) return;
    setError('');
    setNotice('');

    const name = nickname.trim();
    if (!name) {
      setError('닉네임을 입력해 주세요.');
      return;
    }

    const monthsNumber = months === '' ? null : Number(months);
    if (
      monthsNumber !== null &&
      (!Number.isInteger(monthsNumber) || monthsNumber < 1 || monthsNumber > 36)
    ) {
      setError('복무 개월 수는 1~36 사이의 정수로 입력해 주세요.');
      return;
    }
    if ((enlistDate === '') !== (monthsNumber === null)) {
      setError('입대일과 복무 개월 수를 함께 입력해 주세요.');
      return;
    }

    setBusy(true);
    const { error: err } = await getSupabase()
      .from('profiles')
      .update({
        nickname: name,
        enlist_date: enlistDate || null,
        service_months: monthsNumber,
      })
      .eq('id', session.user.id);
    setBusy(false);

    if (err) {
      setError(err.code === '23505' ? '이미 사용 중인 닉네임입니다.' : err.message);
    } else {
      setNotice('저장했어요.');
    }
  }

  async function handleLogout() {
    await getSupabase().auth.signOut();
    router.replace('/login');
  }

  if (loading || (session && !ready && !error)) return <p>불러오는 중...</p>;
  if (!session) return null;

  return (
    <>
      <div className="topbar">
        <h1>설정</h1>
        <Link href="/">홈으로</Link>
      </div>

      <form className="card form" onSubmit={handleSave}>
        <label htmlFor="nickname">닉네임</label>
        <input
          id="nickname"
          type="text"
          maxLength={20}
          required
          value={nickname}
          onChange={(e) => setNickname(e.target.value)}
        />

        <label htmlFor="enlist">입대일</label>
        <input
          id="enlist"
          type="date"
          value={enlistDate}
          onChange={(e) => setEnlistDate(e.target.value)}
        />

        <label htmlFor="months">복무 개월 수</label>
        <input
          id="months"
          type="number"
          min={1}
          max={36}
          inputMode="numeric"
          value={months}
          onChange={(e) => setMonths(e.target.value)}
        />
        <p className="hint">군종마다 복무 기간이 다르니 본인의 복무 개월 수를 입력하세요.</p>

        <button type="submit" disabled={busy}>
          {busy ? '저장 중...' : '저장'}
        </button>
        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}
      </form>

      <button type="button" className="secondary" onClick={handleLogout}>
        로그아웃
      </button>
    </>
  );
}
