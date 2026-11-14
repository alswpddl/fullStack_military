'use client';

import Link from 'next/link';
import { useParams, useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  daysOfMonth,
  eventTypeLabel,
  eventsOnDate,
  monthRange,
  shiftMonth,
  weekdayLabel,
} from '@/lib/calendar';
import {
  ASSIGN_SHIFTS,
  REQUEST_SHIFTS,
  STATUS_LABELS,
  assignShiftLabel,
  assignmentConflicts,
  requestConflicts,
  requestShiftLabel,
  summarizeRequests,
  type AssignShift,
  type DutyRequest,
  type RequestShift,
} from '@/lib/duty';
import { todayKST } from '@/lib/service';
import { getSupabase } from '@/lib/supabase';
import { useGroupData } from '@/lib/useGroupData';
import { useSession } from '@/lib/useSession';

type WriteResult = { error: { message: string } | null };

export default function GroupPage() {
  const router = useRouter();
  const params = useParams<{ id: string }>();
  const groupId = params.id;
  const { session, loading } = useSession();
  const today = todayKST();

  const [year, setYear] = useState(() => Number(todayKST().slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKST().slice(5, 7)));
  const [selected, setSelected] = useState(today);

  // 내 희망 신청 입력값. null 이면 이미 낸 신청의 값(없으면 기본값)을 보여 준다.
  const [shiftEdit, setShiftEdit] = useState<RequestShift | null>(null);
  const [memoEdit, setMemoEdit] = useState<string | null>(null);

  // 관리자의 배정 입력값
  const [assignee, setAssignee] = useState('');
  const [assignShift, setAssignShift] = useState<AssignShift>('day');
  const [dutyName, setDutyName] = useState('');

  const [busy, setBusy] = useState(false);

  const range = useMemo(() => monthRange(year, month), [year, month]);
  const dates = useMemo(() => daysOfMonth(year, month), [year, month]);

  const {
    group,
    members,
    membersLoaded,
    requests,
    assignments,
    events,
    ready,
    error,
    setError,
    refresh,
  } = useGroupData(groupId, range.start, range.end, Boolean(session));

  const uid = session?.user.id ?? '';
  const memberIds = useMemo(() => new Set(members.map((m) => m.user_id)), [members]);
  const groupEvents = useMemo(
    () => events.filter((e) => memberIds.has(e.user_id)),
    [events, memberIds],
  );

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  // 구성원 목록을 불러왔는데 내가 없다면(내보내졌거나 그룹이 삭제됨) 목록 화면으로 보낸다.
  useEffect(() => {
    if (membersLoaded && uid && !members.some((m) => m.user_id === uid)) {
      router.replace('/groups');
    }
  }, [membersLoaded, uid, members, router]);

  function nick(userId: string): string {
    return members.find((m) => m.user_id === userId)?.nickname ?? '(알 수 없음)';
  }

  function selectDate(date: string) {
    setSelected(date);
    setShiftEdit(null);
    setMemoEdit(null);
    setError('');
  }

  function move(delta: number) {
    const next = shiftMonth(year, month, delta);
    const isThisMonth =
      next.year === Number(today.slice(0, 4)) && next.month === Number(today.slice(5, 7));
    setYear(next.year);
    setMonth(next.month);
    selectDate(isThisMonth ? today : `${next.year}-${String(next.month).padStart(2, '0')}-01`);
  }

  /** 쓰기 작업 공통 처리: 진행 표시, 오류 표시, 성공하면 화면 새로고침. */
  async function run(action: () => PromiseLike<WriteResult>): Promise<boolean> {
    setError('');
    setBusy(true);
    const { error: err } = await action();
    setBusy(false);
    if (err) {
      setError(err.message);
      return false;
    }
    refresh();
    return true;
  }

  const me = members.find((m) => m.user_id === uid);
  const isAdmin = me?.role === 'admin';
  const isOwner = group?.owner_id === uid;

  const dayRequests = requests.filter((r) => r.request_date === selected);
  const dayAssignments = assignments.filter((a) => a.duty_date === selected);
  const dayEvents = eventsOnDate(groupEvents, selected);
  const myRequest = requests.find((r) => r.user_id === uid && r.request_date === selected);
  const myLocked = myRequest !== undefined && myRequest.status !== 'requested';

  const shiftValue: RequestShift = shiftEdit ?? myRequest?.shift_type ?? 'day';
  const memoValue = memoEdit ?? myRequest?.memo ?? '';
  const assigneeValue = assignee || members[0]?.user_id || '';

  async function handleSaveRequest(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uid || myLocked) return;
    const memo = memoValue.trim() || null;
    const supabase = getSupabase();

    await run(() =>
      myRequest
        ? supabase
            .from('duty_requests')
            .update({ shift_type: shiftValue, memo })
            .eq('id', myRequest.id)
        : supabase.from('duty_requests').insert({
            group_id: groupId,
            user_id: uid,
            request_date: selected,
            shift_type: shiftValue,
            memo,
          }),
    );
  }

  async function handleCancelRequest() {
    if (!myRequest) return;
    const ok = await run(() => getSupabase().from('duty_requests').delete().eq('id', myRequest.id));
    if (ok) {
      setShiftEdit(null);
      setMemoEdit(null);
    }
  }

  async function handleSetStatus(request: DutyRequest, status: 'approved' | 'rejected') {
    await run(() =>
      getSupabase().from('duty_requests').update({ status }).eq('id', request.id),
    );
  }

  function prefillAssign(request: DutyRequest) {
    setAssignee(request.user_id);
    setAssignShift(request.shift_type === 'night' ? 'night' : 'day');
    setDutyName('');
  }

  async function handleAddAssignment(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!uid || !assigneeValue) return;

    const ok = await run(() =>
      getSupabase()
        .from('duty_assignments')
        .insert({
          group_id: groupId,
          duty_date: selected,
          duty_name: dutyName.trim() || `${assignShiftLabel(assignShift)}근무`,
          shift_type: assignShift,
          assignee_id: assigneeValue,
          created_by: uid,
        }),
    );
    if (ok) setDutyName('');
  }

  async function handleDeleteAssignment(id: string) {
    await run(() => getSupabase().from('duty_assignments').delete().eq('id', id));
  }

  async function handleRemoveMember(userId: string) {
    if (!window.confirm(`${nick(userId)}님을 그룹에서 내보낼까요?`)) return;
    await run(() =>
      getSupabase().from('group_members').delete().eq('group_id', groupId).eq('user_id', userId),
    );
  }

  async function handleLeave() {
    if (!window.confirm('이 그룹에서 나갈까요?')) return;
    const ok = await run(() =>
      getSupabase().from('group_members').delete().eq('group_id', groupId).eq('user_id', uid),
    );
    if (ok) router.push('/groups');
  }

  async function handleDeleteGroup() {
    if (!window.confirm('그룹을 삭제하면 모든 신청과 근무 배정이 함께 사라져요. 정말 삭제할까요?')) {
      return;
    }
    const ok = await run(() => getSupabase().from('groups').delete().eq('id', groupId));
    if (ok) router.push('/groups');
  }

  if (loading || (session && !ready)) return <p>불러오는 중...</p>;
  if (!session) return null;
  if (!group) {
    return (
      <>
        <p className="error">{error || '그룹을 찾을 수 없어요.'}</p>
        <Link href="/groups">그룹 목록으로</Link>
      </>
    );
  }

  return (
    <>
      <div className="topbar">
        <h1>{group.name}</h1>
        <Link href="/groups">그룹 목록</Link>
      </div>

      {isAdmin && (
        <p className="hint">
          초대 코드: <strong>{group.invite_code}</strong> (구성원에게 알려 주세요)
        </p>
      )}
      <p className="hint">다른 구성원이 바꾼 내용은 이 화면에 바로 반영돼요.</p>

      <div className="card">
        <div className="month-nav">
          <button type="button" className="nav-btn" onClick={() => move(-1)} aria-label="이전 달">
            ‹
          </button>
          <strong>
            {year}년 {month}월
          </strong>
          <button type="button" className="nav-btn" onClick={() => move(1)} aria-label="다음 달">
            ›
          </button>
        </div>

        <ul className="day-list">
          {dates.map((date) => {
            const counts = summarizeRequests(requests, date);
            const total = counts.day + counts.night + counts.off;
            const mine = requests.find((r) => r.user_id === uid && r.request_date === date);
            const classes = [
              'day-row',
              date === today ? 'today' : '',
              date === selected ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <li key={date}>
                <button type="button" className={classes} onClick={() => selectDate(date)}>
                  <span className="day-label">
                    {Number(date.slice(8))}
                    <small>{weekdayLabel(date)}</small>
                  </span>
                  <span className="day-chips">
                    {assignments
                      .filter((a) => a.duty_date === date)
                      .map((a) => (
                        <span key={a.id} className={`chip shift-${a.shift_type}`}>
                          {nick(a.assignee_id)} {assignShiftLabel(a.shift_type)}
                        </span>
                      ))}
                  </span>
                  <span className="day-meta">
                    {mine ? `내 희망 ${requestShiftLabel(mine.shift_type)}` : ''}
                    {mine && total > 0 ? ' · ' : ''}
                    {total > 0 ? `신청 ${total}` : ''}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>

      <div className="card">
        <strong>
          {selected} ({weekdayLabel(selected)})
        </strong>

        <h2>근무 배정</h2>
        {dayAssignments.length === 0 ? (
          <p className="hint">아직 배정이 없어요.</p>
        ) : (
          <ul className="rows">
            {dayAssignments.map((a) => {
              const conflicts = assignmentConflicts(a, groupEvents);
              return (
                <li key={a.id}>
                  <div>
                    <div>
                      <span className={`chip shift-${a.shift_type}`}>
                        {assignShiftLabel(a.shift_type)}
                      </span>{' '}
                      {nick(a.assignee_id)} · {a.duty_name}
                    </div>
                    {conflicts.length > 0 && (
                      <div className="warn">
                        ⚠ {conflicts.map((c) => eventTypeLabel(c.type)).join(', ')} 일정과 겹쳐요
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <button
                      type="button"
                      className="link-button"
                      disabled={busy}
                      onClick={() => handleDeleteAssignment(a.id)}
                    >
                      삭제
                    </button>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h2>희망 신청</h2>
        {dayRequests.length === 0 ? (
          <p className="hint">이 날짜에는 신청이 없어요.</p>
        ) : (
          <ul className="rows">
            {dayRequests.map((r) => {
              const conflicts = requestConflicts(r, groupEvents);
              return (
                <li key={r.id}>
                  <div>
                    <div>
                      {nick(r.user_id)} · {requestShiftLabel(r.shift_type)}{' '}
                      <span className={`status ${r.status}`}>{STATUS_LABELS[r.status]}</span>
                    </div>
                    {r.memo && <div className="hint">{r.memo}</div>}
                    {conflicts.length > 0 && (
                      <div className="warn">
                        ⚠ {conflicts.map((c) => eventTypeLabel(c.type)).join(', ')} 일정과 겹쳐요
                      </div>
                    )}
                  </div>
                  {isAdmin && (
                    <div className="actions">
                      <button
                        type="button"
                        className="small-btn"
                        disabled={busy}
                        onClick={() => handleSetStatus(r, 'approved')}
                      >
                        승인
                      </button>
                      <button
                        type="button"
                        className="small-btn secondary"
                        disabled={busy}
                        onClick={() => handleSetStatus(r, 'rejected')}
                      >
                        반려
                      </button>
                      {r.shift_type !== 'off' && (
                        <button
                          type="button"
                          className="small-btn secondary"
                          onClick={() => prefillAssign(r)}
                        >
                          배정
                        </button>
                      )}
                    </div>
                  )}
                </li>
              );
            })}
          </ul>
        )}

        <h2>구성원 휴가·외출</h2>
        {dayEvents.length === 0 ? (
          <p className="hint">공개된 일정이 없어요.</p>
        ) : (
          <ul className="rows">
            {dayEvents.map((e) => (
              <li key={e.id}>
                <span>
                  <span className={`chip ${e.type}`}>{eventTypeLabel(e.type)}</span>{' '}
                  {nick(e.user_id)}
                </span>
                <span className="hint">
                  {e.start_date === e.end_date ? e.start_date : `${e.start_date} ~ ${e.end_date}`}
                </span>
              </li>
            ))}
          </ul>
        )}
        <p className="hint">구성원이 일정의 공개 범위를 &apos;그룹에 공개&apos;로 둔 것만 보여요.</p>
      </div>

      <form className="card form" onSubmit={handleSaveRequest}>
        <strong>내 희망 근무 ({selected})</strong>

        {myRequest && (
          <p className="hint">
            현재 신청: {requestShiftLabel(myRequest.shift_type)} (
            {STATUS_LABELS[myRequest.status]})
          </p>
        )}
        {myLocked ? (
          <p className="hint">
            관리자가 처리한 신청은 수정할 수 없어요. 취소한 뒤 다시 신청해 주세요.
          </p>
        ) : (
          <>
            <label htmlFor="req-shift">희망</label>
            <select
              id="req-shift"
              value={shiftValue}
              onChange={(e) => setShiftEdit(e.target.value as RequestShift)}
            >
              {REQUEST_SHIFTS.map((s) => (
                <option key={s.value} value={s.value}>
                  {s.label}
                </option>
              ))}
            </select>

            <label htmlFor="req-memo">메모</label>
            <input
              id="req-memo"
              type="text"
              maxLength={100}
              value={memoValue}
              onChange={(e) => setMemoEdit(e.target.value)}
            />

            <button type="submit" disabled={busy}>
              {myRequest ? '신청 수정' : '신청'}
            </button>
          </>
        )}
        {myRequest && (
          <button type="button" className="secondary" disabled={busy} onClick={handleCancelRequest}>
            신청 취소
          </button>
        )}
      </form>

      {isAdmin && (
        <form className="card form" onSubmit={handleAddAssignment}>
          <strong>근무 배정 추가 ({selected})</strong>

          <label htmlFor="assignee">담당자</label>
          <select id="assignee" value={assigneeValue} onChange={(e) => setAssignee(e.target.value)}>
            {members.map((m) => (
              <option key={m.user_id} value={m.user_id}>
                {m.nickname}
              </option>
            ))}
          </select>

          <label htmlFor="assign-shift">구분</label>
          <select
            id="assign-shift"
            value={assignShift}
            onChange={(e) => setAssignShift(e.target.value as AssignShift)}
          >
            {ASSIGN_SHIFTS.map((s) => (
              <option key={s.value} value={s.value}>
                {s.label}
              </option>
            ))}
          </select>

          <label htmlFor="duty-name">이름 (비우면 &quot;{assignShiftLabel(assignShift)}근무&quot;)</label>
          <input
            id="duty-name"
            type="text"
            maxLength={30}
            value={dutyName}
            onChange={(e) => setDutyName(e.target.value)}
          />

          <button type="submit" disabled={busy}>
            배정 추가
          </button>
        </form>
      )}

      <div className="card">
        <strong>구성원 ({members.length}명)</strong>
        <ul className="rows">
          {members.map((m) => (
            <li key={m.user_id}>
              <span>
                {m.nickname}
                {m.user_id === group.owner_id ? ' (만든 사람)' : ''}
              </span>
              <span className="actions">
                <span className="hint">{m.role === 'admin' ? '관리자' : '구성원'}</span>
                {isAdmin && m.user_id !== uid && m.user_id !== group.owner_id && (
                  <button
                    type="button"
                    className="link-button"
                    disabled={busy}
                    onClick={() => handleRemoveMember(m.user_id)}
                  >
                    내보내기
                  </button>
                )}
              </span>
            </li>
          ))}
        </ul>
        {isOwner ? (
          <>
            <p className="hint">그룹을 만든 사람은 나갈 수 없어요. 그룹을 없애려면 삭제하세요.</p>
            <button type="button" className="danger" disabled={busy} onClick={handleDeleteGroup}>
              그룹 삭제
            </button>
          </>
        ) : (
          <button type="button" className="secondary" disabled={busy} onClick={handleLeave}>
            그룹 나가기
          </button>
        )}
      </div>

      {error && <p className="error">{error}</p>}
    </>
  );
}
