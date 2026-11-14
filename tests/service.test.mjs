import assert from 'node:assert/strict';
import { test } from 'node:test';
import {
  calcDischargeDate,
  calcServiceSummary,
  daysBetween,
  todayKST,
} from '../src/lib/service.ts';

test('전역일 = 입대일 + 복무 개월 수의 전날', () => {
  assert.equal(calcDischargeDate('2025-05-14', 20), '2027-01-13');
  assert.equal(calcDischargeDate('2025-05-14', 18), '2026-11-13');
  assert.equal(calcDischargeDate('2025-01-01', 18), '2026-06-30');
});

test('해당하는 날이 없는 달은 말일로 처리', () => {
  assert.equal(calcDischargeDate('2025-08-31', 18), '2027-02-28');
  assert.equal(calcDischargeDate('2024-02-29', 12), '2025-02-28');
  assert.equal(calcDischargeDate('2023-12-31', 2), '2024-02-29');
});

test('두 날짜 사이의 일수', () => {
  assert.equal(daysBetween('2026-11-14', '2027-01-13'), 60);
  assert.equal(daysBetween('2027-01-13', '2026-11-14'), -60);
  assert.equal(daysBetween('2026-03-01', '2026-03-01'), 0);
});

test('요약: 진행 중', () => {
  const s = calcServiceSummary('2025-05-14', 20, '2026-11-14');
  assert.equal(s.dischargeDate, '2027-01-13');
  assert.equal(s.daysLeft, 60);
  assert.equal(s.daysServed + s.daysLeft, s.totalDays - 1);
  assert.ok(s.progressPercent > 0 && s.progressPercent < 100);
});

test('요약: 전역일 당일은 D-0, 진행률 100', () => {
  const s = calcServiceSummary('2025-05-14', 20, '2027-01-13');
  assert.equal(s.daysLeft, 0);
  assert.equal(s.progressPercent, 100);
});

test('요약: 전역 후, 입대 전 범위 제한', () => {
  const after = calcServiceSummary('2025-05-14', 20, '2027-02-01');
  assert.ok(after.daysLeft < 0);
  assert.equal(after.progressPercent, 100);
  const before = calcServiceSummary('2025-05-14', 20, '2025-05-01');
  assert.equal(before.progressPercent, 0);
});

test('한국 시간 기준 오늘 날짜', () => {
  assert.equal(todayKST(new Date('2026-11-13T15:30:00Z')), '2026-11-14');
  assert.equal(todayKST(new Date('2026-11-13T14:59:59Z')), '2026-11-13');
});

test('잘못된 날짜 형식은 오류', () => {
  assert.throws(() => calcDischargeDate('2025/05/14', 18));
});
