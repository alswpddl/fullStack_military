// 그룹 근무표 계산 (순수 함수, 런타임 의존성 없음)
// 타입만 calendar.ts 에서 가져온다. (import type 은 실행 시 사라지므로 Node 테스트에서도 문제없다)

import type { CalendarEvent } from './calendar';

export type RequestShift = 'day' | 'night' | 'off';
export type AssignShift = 'day' | 'night' | 'etc';
export type RequestStatus = 'requested' | 'approved' | 'rejected';
export type MemberRole = 'admin' | 'member';

export const REQUEST_SHIFTS: { value: RequestShift; label: string }[] = [
  { value: 'day', label: '주간' },
  { value: 'night', label: '야간' },
  { value: 'off', label: '휴무' },
];

export const ASSIGN_SHIFTS: { value: AssignShift; label: string }[] = [
  { value: 'day', label: '주간' },
  { value: 'night', label: '야간' },
  { value: 'etc', label: '기타' },
];

export const STATUS_LABELS: Record<RequestStatus, string> = {
  requested: '대기',
  approved: '승인',
  rejected: '반려',
};

export type Member = { user_id: string; role: MemberRole; nickname: string };

export type DutyRequest = {
  id: string;
  group_id: string;
  user_id: string;
  request_date: string;
  shift_type: RequestShift;
  status: RequestStatus;
  memo: string | null;
};

export type DutyAssignment = {
  id: string;
  group_id: string;
  duty_date: string;
  duty_name: string;
  shift_type: AssignShift;
  assignee_id: string;
  created_by: string | null;
};

type EventRange = Pick<CalendarEvent, 'user_id' | 'type' | 'start_date' | 'end_date'>;

export function requestShiftLabel(value: RequestShift): string {
  return REQUEST_SHIFTS.find((s) => s.value === value)?.label ?? value;
}

export function assignShiftLabel(value: AssignShift): string {
  return ASSIGN_SHIFTS.find((s) => s.value === value)?.label ?? value;
}

/** 초대 코드 입력 정리: 공백 제거, 대문자. (DB 함수도 같은 규칙으로 비교한다) */
export function normalizeInviteCode(input: string): string {
  return input.replace(/\s+/g, '').toUpperCase();
}

/** 그룹 이름이 올바르면 null, 아니면 오류 문구. */
export function validateGroupName(name: string): string | null {
  const trimmed = name.trim();
  if (!trimmed) return '그룹 이름을 입력해 주세요.';
  if (trimmed.length > 30) return '그룹 이름은 30자 이하로 입력해 주세요.';
  return null;
}

/** 그 사람이 그 날짜에 휴가·외박·외출 등 일정이 있으면 해당 일정들을 돌려준다. */
export function conflictsFor<T extends EventRange>(
  events: T[],
  userId: string,
  date: string,
): T[] {
  return events.filter(
    (e) => e.user_id === userId && e.start_date <= date && date <= e.end_date,
  );
}

/** 희망 신청과 겹치는 일정. '휴무' 희망은 일정과 겹쳐도 충돌이 아니다. */
export function requestConflicts<T extends EventRange>(
  request: Pick<DutyRequest, 'user_id' | 'request_date' | 'shift_type'>,
  events: T[],
): T[] {
  if (request.shift_type === 'off') return [];
  return conflictsFor(events, request.user_id, request.request_date);
}

/** 배정과 겹치는 일정. */
export function assignmentConflicts<T extends EventRange>(
  assignment: Pick<DutyAssignment, 'assignee_id' | 'duty_date'>,
  events: T[],
): T[] {
  return conflictsFor(events, assignment.assignee_id, assignment.duty_date);
}

/** 그 날짜의 희망 신청 수 (반려된 신청은 제외). */
export function summarizeRequests(
  requests: Pick<DutyRequest, 'request_date' | 'shift_type' | 'status'>[],
  date: string,
): Record<RequestShift, number> {
  const result: Record<RequestShift, number> = { day: 0, night: 0, off: 0 };
  for (const r of requests) {
    if (r.request_date === date && r.status !== 'rejected') result[r.shift_type] += 1;
  }
  return result;
}

/** Supabase Realtime 이 보내는 변경 알림 중 우리가 쓰는 부분. */
export type RowChange = {
  eventType: string;
  new: Record<string, unknown>;
  old: Record<string, unknown>;
};

/**
 * 변경 알림을 목록에 반영한 새 목록을 돌려준다. 원본은 바꾸지 않는다.
 * - INSERT: 없으면 추가, 이미 있으면 교체 (내 변경이 두 번 도착해도 중복되지 않는다)
 * - UPDATE: 교체, 목록에 없으면 추가
 * - DELETE: 알림의 old.id 로 제거 (삭제 알림에는 기본키만 들어 있다)
 */
export function applyChange<T extends { id: string }>(list: T[], change: RowChange): T[] {
  if (change.eventType === 'DELETE') {
    const id = change.old?.id;
    return typeof id === 'string' ? list.filter((item) => item.id !== id) : list;
  }

  const row = change.new as unknown as T | undefined;
  if (!row || typeof row.id !== 'string') return list;

  const index = list.findIndex((item) => item.id === row.id);
  if (index === -1) return [...list, row];

  const next = list.slice();
  next[index] = row;
  return next;
}
