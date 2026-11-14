import assert from 'node:assert/strict';
import { test } from 'node:test';
import { daysOfMonth, weekdayLabel } from '../src/lib/calendar.ts';
import {
  applyChange,
  assignmentConflicts,
  conflictsFor,
  normalizeInviteCode,
  requestConflicts,
  summarizeRequests,
  validateGroupName,
} from '../src/lib/duty.ts';

const leaveA = { user_id: 'a', type: 'leave', start_date: '2026-11-20', end_date: '2026-11-22' };
const outingB = { user_id: 'b', type: 'outing', start_date: '2026-11-21', end_date: '2026-11-21' };

test('달의 날짜 목록과 요일', () => {
  assert.equal(daysOfMonth(2024, 2).length, 29);
  assert.equal(daysOfMonth(2026, 11)[0], '2026-11-01');
  assert.equal(daysOfMonth(2026, 11).at(-1), '2026-11-30');
  assert.equal(weekdayLabel('2026-11-14'), '토');
  assert.equal(weekdayLabel('2026-11-15'), '일');
  assert.equal(weekdayLabel('2026-11-16'), '월');
});

test('일정 충돌: 본인 일정만, 시작일·종료일 포함', () => {
  const events = [leaveA, outingB];
  assert.equal(conflictsFor(events, 'a', '2026-11-19').length, 0);
  assert.equal(conflictsFor(events, 'a', '2026-11-20').length, 1);
  assert.equal(conflictsFor(events, 'a', '2026-11-22').length, 1);
  assert.equal(conflictsFor(events, 'a', '2026-11-23').length, 0);
  // 다른 사람의 외출은 a 의 충돌이 아니다
  assert.equal(conflictsFor(events, 'a', '2026-11-21').length, 1);
  assert.equal(conflictsFor(events, 'a', '2026-11-21')[0].type, 'leave');
  assert.equal(conflictsFor(events, 'b', '2026-11-21')[0].type, 'outing');
});

test('희망 신청 충돌: 휴무 희망은 충돌 아님', () => {
  const events = [leaveA];
  const day = { user_id: 'a', request_date: '2026-11-21', shift_type: 'day' };
  const night = { ...day, shift_type: 'night' };
  const off = { ...day, shift_type: 'off' };
  assert.equal(requestConflicts(day, events).length, 1);
  assert.equal(requestConflicts(night, events).length, 1);
  assert.equal(requestConflicts(off, events).length, 0);
  assert.equal(requestConflicts({ ...day, request_date: '2026-11-25' }, events).length, 0);
});

test('배정 충돌', () => {
  const events = [leaveA];
  assert.equal(assignmentConflicts({ assignee_id: 'a', duty_date: '2026-11-21' }, events).length, 1);
  assert.equal(assignmentConflicts({ assignee_id: 'b', duty_date: '2026-11-21' }, events).length, 0);
});

test('신청 집계: 반려 제외, 해당 날짜만', () => {
  const requests = [
    { request_date: '2026-11-21', shift_type: 'day', status: 'requested' },
    { request_date: '2026-11-21', shift_type: 'day', status: 'approved' },
    { request_date: '2026-11-21', shift_type: 'night', status: 'rejected' },
    { request_date: '2026-11-21', shift_type: 'off', status: 'requested' },
    { request_date: '2026-11-22', shift_type: 'night', status: 'requested' },
  ];
  assert.deepEqual(summarizeRequests(requests, '2026-11-21'), { day: 2, night: 0, off: 1 });
  assert.deepEqual(summarizeRequests(requests, '2026-11-23'), { day: 0, night: 0, off: 0 });
});

test('실시간 변경 반영: INSERT / UPDATE / DELETE', () => {
  const a = { id: '1', status: 'requested' };
  const b = { id: '2', status: 'requested' };
  const list = [a, b];

  const inserted = applyChange(list, { eventType: 'INSERT', new: { id: '3', status: 'requested' }, old: {} });
  assert.equal(inserted.length, 3);
  assert.equal(list.length, 2, '원본은 바뀌지 않는다');

  const again = applyChange(inserted, { eventType: 'INSERT', new: { id: '3', status: 'requested' }, old: {} });
  assert.equal(again.length, 3, '같은 INSERT 가 두 번 와도 중복되지 않는다');

  const updated = applyChange(list, { eventType: 'UPDATE', new: { id: '1', status: 'approved' }, old: { id: '1' } });
  assert.equal(updated.find((x) => x.id === '1').status, 'approved');
  assert.equal(updated.length, 2);

  const upsertNew = applyChange(list, { eventType: 'UPDATE', new: { id: '9', status: 'approved' }, old: { id: '9' } });
  assert.equal(upsertNew.length, 3);

  const deleted = applyChange(list, { eventType: 'DELETE', new: {}, old: { id: '2' } });
  assert.deepEqual(deleted.map((x) => x.id), ['1']);

  assert.equal(applyChange(list, { eventType: 'DELETE', new: {}, old: {} }), list);
  assert.equal(applyChange(list, { eventType: 'INSERT', new: {}, old: {} }), list);
});

test('초대 코드·그룹 이름 검증', () => {
  assert.equal(normalizeInviteCode('  ab12 cd34 '), 'AB12CD34');
  assert.equal(validateGroupName('  '), '그룹 이름을 입력해 주세요.');
  assert.equal(validateGroupName('x'.repeat(31)), '그룹 이름은 30자 이하로 입력해 주세요.');
  assert.equal(validateGroupName('1소대'), null);
});
