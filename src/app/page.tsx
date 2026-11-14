'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useState } from 'react';
import { calcServiceSummary } from '@/lib/service';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

type Profile = {
  nickname: string;
  enlist_date: string | null;
  service_months: number | null;
};

function dDayLabel(daysLeft: number): string {
  if (daysLeft > 0) return `D-${daysLeft}`;
  if (daysLeft === 0) return 'D-DAY';
  return `전역 ${-daysLeft}일째`;
}

export default function HomePage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const [profile, setProfile] = useState<Profile | null>(null);
  const [error, setError] = useState('');

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
        if (err) setError(err.message);
        else setProfile(data as Profile);
      });
  }, [session]);

  if (loading || (session && !profile && !error)) {
    return <p>불러오는 중...</p>;
  }
  if (!session) return null;
  if (error) return <p className="error">프로필을 불러오지 못했어요: {error}</p>;
  if (!profile) return null;

  const summary =
    profile.enlist_date && profile.service_months
      ? calcServiceSummary(profile.enlist_date, profile.service_months)
      : null;

  return (
    <>
      <div className="topbar">
        <h1>{profile.nickname}님</h1>
        <nav className="nav-links">
          <Link href="/calendar">달력</Link>
          <Link href="/groups">그룹</Link>
          <Link href="/settings">설정</Link>
        </nav>
      </div>

      {summary ? (
        <>
          <div className="card">
            <div>전역까지</div>
            <div className="dday">{dDayLabel(summary.daysLeft)}</div>
            <div className="progress">
              <div style={{ width: `${summary.progressPercent}%` }} />
            </div>
            <div className="progress-label">{summary.progressPercent.toFixed(1)}%</div>
          </div>

          <ul className="card rows">
            <li>
              <span>입대일</span>
              <span>{profile.enlist_date}</span>
            </li>
            <li>
              <span>전역일</span>
              <span>{summary.dischargeDate}</span>
            </li>
            <li>
              <span>복무한 날</span>
              <span>{Math.max(0, summary.daysServed + 1)}일</span>
            </li>
            <li>
              <span>전체 복무</span>
              <span>{summary.totalDays}일</span>
            </li>
          </ul>
        </>
      ) : (
        <div className="card">
          <p>입대일과 복무 개월 수를 입력하면 전역일과 D-day를 보여 드려요.</p>
          <Link href="/settings">복무 정보 입력하러 가기</Link>
        </div>
      )}
    </>
  );
}
