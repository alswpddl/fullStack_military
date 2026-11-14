import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  buildMonthGrid,
  eventCoversDate,
  eventsOnDate,
  eventTypeLabel,
  isValidDate,
  monthRange,
  shiftMonth,
  validateEventInput,
} from '../src/lib/calendar.ts';

test('월 달력: 일요일 시작, 7의 배수 칸', () => {
  // 2026-11-01 은 일요일, 30일 -> 5주
  const nov = buildMonthGrid(2026, 11);
  assert.equal(nov.length, 5);
  assert.equal(nov[0][0].date, '2026-11-01');
  assert.equal(nov[4][6].date, '2026-12-05');
  assert.ok(nov.every((week) => week.length === 7));

  // 2027-01-01 은 금요일 -> 앞 5칸이 12월, 6주
  const jan = buildMonthGrid(2027, 1);
  assert.equal(jan.length, 6);
  assert.equal(jan[0][0].date, '2026-12-27');
  assert.equal(jan[0][0].inMonth, false);
  assert.equal(jan[0][5].date, '2027-01-01');
  assert.equal(jan[0][5].inMonth, true);
  assert.equal(jan[5][6].date, '2027-02-06');
});

test('월 달력: 윤년 2월', () => {
  const feb = buildMonthGrid(2024, 2);
  const inMonth = feb.flat().filter((c) => c.inMonth);
  assert.equal(inMonth.length, 29);
  assert.equal(inMonth.at(-1).date, '2024-02-29');
  assert.equal(feb.at(-1).at(-1).date, '2024-03-02');
});

test('월 범위와 월 이동', () => {
  assert.deepEqual(monthRange(2024, 2), { start: '2024-02-01', end: '2024-02-29' });
  assert.deepEqual(monthRange(2026, 12), { start: '2026-12-01', end: '2026-12-31' });
  assert.deepEqual(shiftMonth(2026, 12, 1), { year: 2027, month: 1 });
  assert.deepEqual(shiftMonth(2026, 1, -1), { year: 2025, month: 12 });
  assert.deepEqual(shiftMonth(2026, 6, 0), { year: 2026, month: 6 });
  assert.deepEqual(shiftMonth(2026, 11, 14), { year: 2028, month: 1 });
});

test('일정 기간 판정: 시작일과 종료일 포함, 달 경계를 넘는 일정', () => {
  const leave = { start_date: '2026-11-28', end_date: '2026-12-02' };
  assert.equal(eventCoversDate(leave, '2026-11-27'), false);
  assert.equal(eventCoversDate(leave, '2026-11-28'), true);
  assert.equal(eventCoversDate(leave, '2026-12-01'), true);
  assert.equal(eventCoversDate(leave, '2026-12-02'), true);
  assert.equal(eventCoversDate(leave, '2026-12-03'), false);

  const one = { start_date: '2026-11-14', end_date: '2026-11-14' };
  assert.equal(eventsOnDate([leave, one], '2026-11-14').length, 1);
  assert.equal(eventsOnDate([leave, one], '2026-11-30').length, 1);
  assert.equal(eventsOnDate([leave, one], '2026-10-01').length, 0);
});

test('날짜 유효성', () => {
  assert.equal(isValidDate('2026-11-14'), true);
  assert.equal(isValidDate('2024-02-29'), true);
  assert.equal(isValidDate('2025-02-29'), false);
  assert.equal(isValidDate('2026-13-01'), false);
  assert.equal(isValidDate('2026-1-1'), false);
  assert.equal(isValidDate(''), false);
});

test('일정 입력 검증', () => {
  const ok = { type: 'leave', title: '휴가', start_date: '2026-11-20', end_date: '2026-11-22' };
  assert.equal(validateEventInput(ok), null);
  assert.equal(validateEventInput({ ...ok, title: '' }), null);
  assert.equal(validateEventInput({ ...ok, end_date: '2026-11-19' }), '종료일은 시작일 이후여야 합니다.');
  assert.equal(validateEventInput({ ...ok, start_date: '' }), '시작일을 올바르게 입력해 주세요.');
  assert.equal(validateEventInput({ ...ok, end_date: '2026-02-30' }), '종료일을 올바르게 입력해 주세요.');
  assert.equal(validateEventInput({ ...ok, title: 'x'.repeat(51) }), '제목은 50자 이하로 입력해 주세요.');
});

test('일정 유형 이름', () => {
  assert.equal(eventTypeLabel('leave'), '휴가');
  assert.equal(eventTypeLabel('overnight'), '외박');
  assert.equal(eventTypeLabel('outing'), '외출');
  assert.equal(eventTypeLabel('etc'), '기타');
});
