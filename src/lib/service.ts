// 복무 기간 계산 (순수 함수, 외부 의존성 없음)
// 날짜는 모두 'YYYY-MM-DD' 문자열로 주고받고, 내부 계산은 UTC 자정 기준으로 해서
// 브라우저 시간대(서머타임 등)에 따라 하루씩 어긋나지 않게 한다.

const DAY_MS = 24 * 60 * 60 * 1000;

function parse(date: string): { y: number; m: number; d: number } {
  const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date);
  if (!match) throw new Error(`날짜 형식이 올바르지 않습니다: ${date}`);
  return { y: Number(match[1]), m: Number(match[2]), d: Number(match[3]) };
}

function toUtc(y: number, m: number, d: number): number {
  return Date.UTC(y, m - 1, d);
}

function format(ms: number): string {
  const date = new Date(ms);
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

function daysInMonth(y: number, m: number): number {
  return new Date(Date.UTC(y, m, 0)).getUTCDate();
}

/** 두 날짜 사이의 일수 (to - from). */
export function daysBetween(from: string, to: string): number {
  const a = parse(from);
  const b = parse(to);
  return Math.round((toUtc(b.y, b.m, b.d) - toUtc(a.y, a.m, a.d)) / DAY_MS);
}

/** 오늘 날짜(한국 시간) 'YYYY-MM-DD'. */
export function todayKST(now: Date = new Date()): string {
  return format(now.getTime() + 9 * 60 * 60 * 1000);
}

/**
 * 전역일 = 입대일 + 복무 개월 수의 전날.
 * 예) 2025-05-14 입대, 20개월 -> 2027-01-13
 * 해당하는 날이 없는 달(예: 8월 31일 입대 후 2월)이면 그 달의 말일로 한다.
 */
export function calcDischargeDate(enlistDate: string, serviceMonths: number): string {
  const { y, m, d } = parse(enlistDate);
  const index = (y * 12 + (m - 1)) + serviceMonths;
  const targetYear = Math.floor(index / 12);
  const targetMonth = (index % 12) + 1;
  const lastDay = daysInMonth(targetYear, targetMonth);

  if (d > lastDay) {
    return format(toUtc(targetYear, targetMonth, lastDay));
  }
  return format(toUtc(targetYear, targetMonth, d) - DAY_MS);
}

export type ServiceSummary = {
  dischargeDate: string;
  /** 전역까지 남은 일수. 전역일 당일은 0, 지났으면 음수. */
  daysLeft: number;
  /** 입대 후 지난 일수 (입대일 당일은 0). */
  daysServed: number;
  /** 전체 복무 일수 (입대일부터 전역일까지, 양 끝 포함). */
  totalDays: number;
  /** 0 ~ 100 */
  progressPercent: number;
};

export function calcServiceSummary(
  enlistDate: string,
  serviceMonths: number,
  today: string = todayKST(),
): ServiceSummary {
  const dischargeDate = calcDischargeDate(enlistDate, serviceMonths);
  const totalDays = daysBetween(enlistDate, dischargeDate) + 1;
  const daysServed = daysBetween(enlistDate, today);
  const daysLeft = daysBetween(today, dischargeDate);

  const raw = ((daysServed + 1) / totalDays) * 100;
  const progressPercent = Math.min(100, Math.max(0, raw));

  return { dischargeDate, daysLeft, daysServed, totalDays, progressPercent };
}
