'use client';

import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEffect, useMemo, useState, type FormEvent } from 'react';
import {
  EVENT_TYPES,
  VISIBILITY_OPTIONS,
  buildMonthGrid,
  eventTypeLabel,
  eventsOnDate,
  shiftMonth,
  validateEventInput,
  type CalendarEvent,
  type EventType,
  type Visibility,
} from '@/lib/calendar';
import { todayKST } from '@/lib/service';
import { getSupabase } from '@/lib/supabase';
import { useSession } from '@/lib/useSession';

const WEEKDAYS = ['일', '월', '화', '수', '목', '금', '토'];

type FormState = {
  id: string | null;
  type: EventType;
  title: string;
  start_date: string;
  end_date: string;
  visibility: Visibility;
  memo: string;
};

function emptyForm(date: string): FormState {
  return {
    id: null,
    type: 'leave',
    title: '',
    start_date: date,
    end_date: date,
    visibility: 'private',
    memo: '',
  };
}

function visibilityLabel(value: Visibility): string {
  return VISIBILITY_OPTIONS.find((o) => o.value === value)?.label ?? '';
}

export default function CalendarPage() {
  const router = useRouter();
  const { session, loading } = useSession();
  const today = todayKST();
  const [year, setYear] = useState(() => Number(todayKST().slice(0, 4)));
  const [month, setMonth] = useState(() => Number(todayKST().slice(5, 7)));
  const [selected, setSelected] = useState(today);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [form, setForm] = useState<FormState | null>(null);
  const [reloadKey, setReloadKey] = useState(0);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const weeks = useMemo(() => buildMonthGrid(year, month), [year, month]);

  useEffect(() => {
    if (!loading && !session) router.replace('/login');
  }, [loading, session, router]);

  // 화면에 보이는 격자(이웃 달 날짜 포함)와 겹치는 내 일정을 불러온다.
  useEffect(() => {
    if (!session) return;

    const first = weeks[0][0].date;
    const last = weeks[weeks.length - 1][6].date;
    let cancelled = false;

    getSupabase()
      .from('events')
      .select('id, user_id, type, title, start_date, end_date, visibility, memo')
      .eq('user_id', session.user.id)
      .lte('start_date', last)
      .gte('end_date', first)
      .order('start_date')
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err) setError(err.message);
        else setEvents((data ?? []) as CalendarEvent[]);
      });

    return () => {
      cancelled = true;
    };
  }, [session, weeks, reloadKey]);

  function move(delta: number) {
    const next = shiftMonth(year, month, delta);
    const isThisMonth =
      next.year === Number(today.slice(0, 4)) && next.month === Number(today.slice(5, 7));
    setYear(next.year);
    setMonth(next.month);
    setSelected(
      isThisMonth ? today : `${next.year}-${String(next.month).padStart(2, '0')}-01`,
    );
    setForm(null);
    setError('');
  }

  function openNew() {
    setForm(emptyForm(selected));
    setError('');
  }

  function openEdit(event: CalendarEvent) {
    setForm({
      id: event.id,
      type: event.type,
      title: event.title,
      start_date: event.start_date,
      end_date: event.end_date,
      visibility: event.visibility,
      memo: event.memo ?? '',
    });
    setError('');
  }

  async function handleSave(submit: FormEvent<HTMLFormElement>) {
    submit.preventDefault();
    if (!session || !form) return;
    setError('');

    const problem = validateEventInput({
      type: form.type,
      title: form.title,
      start_date: form.start_date,
      end_date: form.end_date,
    });
    if (problem) {
      setError(problem);
      return;
    }

    const row = {
      type: form.type,
      title: form.title.trim() || eventTypeLabel(form.type),
      start_date: form.start_date,
      end_date: form.end_date,
      visibility: form.visibility,
      memo: form.memo.trim() || null,
    };

    setBusy(true);
    const supabase = getSupabase();
    const { error: err } = form.id
      ? await supabase.from('events').update(row).eq('id', form.id)
      : await supabase.from('events').insert({ ...row, user_id: session.user.id });
    setBusy(false);

    if (err) {
      setError(err.message);
      return;
    }
    setForm(null);
    setReloadKey((k) => k + 1);
  }

  async function handleDelete() {
    if (!form?.id) return;
    if (!window.confirm('이 일정을 삭제할까요?')) return;

    setBusy(true);
    const { error: err } = await getSupabase().from('events').delete().eq('id', form.id);
    setBusy(false);

    if (err) {
      setError(err.message);
      return;
    }
    setForm(null);
    setReloadKey((k) => k + 1);
  }

  if (loading) return <p>불러오는 중...</p>;
  if (!session) return null;

  const selectedEvents = eventsOnDate(events, selected);

  return (
    <>
      <div className="topbar">
        <h1>달력</h1>
        <Link href="/">홈으로</Link>
      </div>

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

        <div className="cal-grid">
          {WEEKDAYS.map((w) => (
            <div key={w} className="cal-weekday">
              {w}
            </div>
          ))}
          {weeks.flat().map((cell) => {
            const dayEvents = eventsOnDate(events, cell.date);
            const classes = [
              'cal-cell',
              cell.inMonth ? '' : 'outside',
              cell.date === today ? 'today' : '',
              cell.date === selected ? 'selected' : '',
            ]
              .filter(Boolean)
              .join(' ');
            return (
              <button
                type="button"
                key={cell.date}
                className={classes}
                onClick={() => setSelected(cell.date)}
              >
                <span>{Number(cell.date.slice(8))}</span>
                <span className="dots">
                  {dayEvents.slice(0, 3).map((e) => (
                    <i key={e.id} className={`dot ${e.type}`} />
                  ))}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      <div className="card">
        <div className="topbar">
          <strong>{selected}</strong>
          <button type="button" className="small-btn" onClick={openNew}>
            일정 추가
          </button>
        </div>

        {selectedEvents.length === 0 ? (
          <p className="hint">이 날짜에는 일정이 없어요.</p>
        ) : (
          <ul className="rows">
            {selectedEvents.map((e) => (
              <li key={e.id}>
                <div>
                  <div>
                    <span className={`chip ${e.type}`}>{eventTypeLabel(e.type)}</span> {e.title}
                  </div>
                  <div className="hint">
                    {e.start_date === e.end_date
                      ? e.start_date
                      : `${e.start_date} ~ ${e.end_date}`}{' '}
                    · {visibilityLabel(e.visibility)}
                  </div>
                </div>
                <button type="button" className="link-button" onClick={() => openEdit(e)}>
                  수정
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {form && (
        <form className="card form" onSubmit={handleSave}>
          <strong>{form.id ? '일정 수정' : '일정 추가'}</strong>

          <label htmlFor="type">유형</label>
          <select
            id="type"
            value={form.type}
            onChange={(e) => setForm({ ...form, type: e.target.value as EventType })}
          >
            {EVENT_TYPES.map((t) => (
              <option key={t.value} value={t.value}>
                {t.label}
              </option>
            ))}
          </select>

          <label htmlFor="title">제목 (비우면 유형 이름)</label>
          <input
            id="title"
            type="text"
            maxLength={50}
            value={form.title}
            onChange={(e) => setForm({ ...form, title: e.target.value })}
          />

          <label htmlFor="start">시작일</label>
          <input
            id="start"
            type="date"
            required
            value={form.start_date}
            onChange={(e) => {
              const start = e.target.value;
              // 종료일이 시작일보다 앞서면 함께 옮겨 준다.
              setForm({
                ...form,
                start_date: start,
                end_date: form.end_date < start ? start : form.end_date,
              });
            }}
          />

          <label htmlFor="end">종료일</label>
          <input
            id="end"
            type="date"
            required
            value={form.end_date}
            onChange={(e) => setForm({ ...form, end_date: e.target.value })}
          />

          <label htmlFor="visibility">공개 범위</label>
          <select
            id="visibility"
            value={form.visibility}
            onChange={(e) => setForm({ ...form, visibility: e.target.value as Visibility })}
          >
            {VISIBILITY_OPTIONS.map((o) => (
              <option key={o.value} value={o.value}>
                {o.label}
              </option>
            ))}
          </select>
          <p className="hint">그룹에 공개하면 같은 그룹 구성원이 이 일정을 볼 수 있어요.</p>

          <label htmlFor="memo">메모</label>
          <textarea
            id="memo"
            rows={3}
            maxLength={500}
            value={form.memo}
            onChange={(e) => setForm({ ...form, memo: e.target.value })}
          />
          <p className="hint">작전·훈련 일정이나 부대 내부 정보는 적지 마세요.</p>

          <button type="submit" disabled={busy}>
            {busy ? '저장 중...' : '저장'}
          </button>
          <button type="button" className="secondary" onClick={() => setForm(null)} disabled={busy}>
            취소
          </button>
          {form.id && (
            <button type="button" className="danger" onClick={handleDelete} disabled={busy}>
              삭제
            </button>
          )}
        </form>
      )}

      {error && <p className="error">{error}</p>}
    </>
  );
}
