'use client';

import { useRouter } from 'next/navigation';
import { useEffect, useState, type FormEvent } from 'react';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

type Mode = 'login' | 'signup';

export default function LoginPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [nickname, setNickname] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');

  // 이미 로그인되어 있으면 홈으로 보낸다. (로그인 성공 직후에도 이 효과가 이동시킨다)
  useEffect(() => {
    if (!loading && session) router.replace('/');
  }, [loading, session, router]);

  async function handleSubmit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setError('');
    setNotice('');
    setBusy(true);

    try {
      const supabase = getSupabase();

      if (mode === 'login') {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) setError('이메일 또는 비밀번호가 올바르지 않습니다.');
        return;
      }

      const name = nickname.trim();
      if (!name) {
        setError('닉네임을 입력해 주세요.');
        return;
      }

      const { data, error: err } = await supabase.auth.signUp({
        email,
        password,
        options: { data: { nickname: name } },
      });

      if (err) {
        if (err.message.includes('already registered')) {
          setError('이미 가입된 이메일입니다.');
        } else if (err.message.includes('Database error')) {
          setError('이미 사용 중인 닉네임이거나 가입에 실패했어요. 다른 닉네임으로 시도해 주세요.');
        } else {
          setError(err.message);
        }
      } else if (!data.session) {
        setNotice('가입 확인 메일을 보냈어요. 메일의 링크를 누른 뒤 로그인해 주세요.');
      }
    } catch (e) {
      setError(e instanceof Error ? e.message : '알 수 없는 오류가 발생했어요.');
    } finally {
      setBusy(false);
    }
  }

  const isSignup = mode === 'signup';

  return (
    <>
      <h1>{isSignup ? '회원가입' : '로그인'}</h1>
      <form className="card form" onSubmit={handleSubmit}>
        <label htmlFor="email">이메일</label>
        <input
          id="email"
          type="email"
          autoComplete="email"
          required
          value={email}
          onChange={(e) => setEmail(e.target.value)}
        />

        <label htmlFor="password">비밀번호</label>
        <input
          id="password"
          type="password"
          autoComplete={isSignup ? 'new-password' : 'current-password'}
          minLength={6}
          required
          value={password}
          onChange={(e) => setPassword(e.target.value)}
        />

        {isSignup && (
          <>
            <label htmlFor="nickname">닉네임</label>
            <input
              id="nickname"
              type="text"
              maxLength={20}
              required
              value={nickname}
              onChange={(e) => setNickname(e.target.value)}
            />
            <p className="hint">
              실명, 계급, 군번, 부대명은 쓰지 마세요. 다른 구성원에게 보이는 이름입니다.
            </p>
          </>
        )}

        <button type="submit" disabled={busy}>
          {busy ? '처리 중...' : isSignup ? '가입하기' : '로그인'}
        </button>

        {error && <p className="error">{error}</p>}
        {notice && <p className="notice">{notice}</p>}

        <button
          type="button"
          className="link-button"
          onClick={() => {
            setMode(isSignup ? 'login' : 'signup');
            setError('');
            setNotice('');
          }}
        >
          {isSignup ? '이미 계정이 있어요' : '처음이에요, 회원가입'}
        </button>
      </form>
    </>
  );
}
