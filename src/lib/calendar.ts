// 달력·일정 계산 (순수 함수, 외부 의존성 없음)
// 날짜는 'YYYY-MM-DD' 문자열로 다룬다. 같은 형식이면 문자열 비교가 곧 날짜 비교다.

export type EventType = 'leave' | 'overnight' | 'outing' | 'etc';
export type Visibility = 'private' | 'group';

export const EVENT_TYPES: { value: EventType; label: string }[] = [
  { value: 'leave', label: '휴가' },
  { value: 'overnight', label: '외박' },
  { value: 'outing', label: '외출' },
  { value: 'etc', label: '기타' },
];

export const VISIBILITY_OPTIONS: { value: Visibility; label: string }[] = [
  { value: 'private', label: '나만 보기' },
  { value: 'group', label: '그룹에 공개' },
];

export type CalendarEvent = {
  id: string;
  user_id: string;
  type: EventType;
  title: string;
  start_date: string;
  end_date: string;
  visibility: Visibility;
  memo: string | null;
};

export type EventInput = {
  type: EventType;
  title: string;
  start_date: string;
  end_date: string;
};

export type DayCell = { date: string; inMonth: boolean };

const DAY_MS = 24 * 60 * 60 * 1000;
const DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

function fromUtc(ms: number): string {
  const d = new Date(ms);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function eventTypeLabel(type: EventType): string {
  return EVENT_TYPES.find((t) => t.value === type)?.label ?? '기타';
}

/** 실제로 존재하는 날짜인지 (2026-02-30 같은 값은 false). */
export function isValidDate(value: string): boolean {
  if (!DATE_PATTERN.test(value)) return false;
  const [y, m, d] = value.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return (
    date.getUTCFullYear() === y && date.getUTCMonth() === m - 1 && date.getUTCDate() === d
  );
}

/** 월 이동. month 는 1~12. */
export function shiftMonth(
  year: number,
  month: number,
  delta: number,
): { year: number; month: number } {
  const index = year * 12 + (month - 1) + delta;
  return { year: Math.floor(index / 12), month: (index % 12) + 1 };
}

/** 그 달의 첫날과 마지막날. */
export function monthRange(year: number, month: number): { start: string; end: string } {
  const lastDay = new Date(Date.UTC(year, month, 0)).getUTCDate();
  return {
    start: `${year}-${pad(month)}-01`,
    end: `${year}-${pad(month)}-${pad(lastDay)}`,
  };
}

/** 그 달의 모든 날짜 ('YYYY-MM-DD') 목록. */
export function daysOfMonth(year: number, month: number): string[] {
  const { start, end } = monthRange(year, month);
  const days: string[] = [];
  for (let ms = Date.parse(start); ms <= Date.parse(end); ms += DAY_MS) {
    days.push(fromUtc(ms));
  }
  return days;
}

/** 요일 한 글자 (일~토). */
export function weekdayLabel(date: string): string {
  return ['일', '월', '화', '수', '목', '금', '토'][new Date(Date.parse(date)).getUTCDay()];
}

/**
 * 일요일부터 시작하는 월 달력 격자. 앞뒤로 이웃 달의 날짜를 채워 항상 7의 배수 칸이다.
 * 각 칸은 { date, inMonth }.
 */
export function buildMonthGrid(year: number, month: number): DayCell[][] {
  const { start, end } = monthRange(year, month);
  const first = Date.parse(start);
  const last = Date.parse(end);
  const leading = new Date(first).getUTCDay(); // 0 = 일요일
  const trailing = 6 - new Date(last).getUTCDay();

  const cells: DayCell[] = [];
  for (let ms = first - leading * DAY_MS; ms <= last + trailing * DAY_MS; ms += DAY_MS) {
    const date = fromUtc(ms);
    cells.push({ date, inMonth: date >= start && date <= end });
  }

  const weeks: DayCell[][] = [];
  for (let i = 0; i < cells.length; i += 7) weeks.push(cells.slice(i, i + 7));
  return weeks;
}

/** 일정이 그 날짜를 지나가는지 (시작일과 종료일 모두 포함). */
export function eventCoversDate(
  event: Pick<CalendarEvent, 'start_date' | 'end_date'>,
  date: string,
): boolean {
  return event.start_date <= date && date <= event.end_date;
}

export function eventsOnDate<T extends Pick<CalendarEvent, 'start_date' | 'end_date'>>(
  events: T[],
  date: string,
): T[] {
  return events.filter((event) => eventCoversDate(event, date));
}

/** 입력이 올바르면 null, 아니면 화면에 보여 줄 오류 문구. */
export function validateEventInput(input: EventInput): string | null {
  if (input.title.trim().length > 50) return '제목은 50자 이하로 입력해 주세요.';
  if (!isValidDate(input.start_date)) return '시작일을 올바르게 입력해 주세요.';
  if (!isValidDate(input.end_date)) return '종료일을 올바르게 입력해 주세요.';
  if (input.end_date < input.start_date) return '종료일은 시작일 이후여야 합니다.';
  return null;
}
