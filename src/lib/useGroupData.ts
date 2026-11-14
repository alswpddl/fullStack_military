'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import type { CalendarEvent } from './calendar';
import {
  applyChange,
  type DutyAssignment,
  type DutyRequest,
  type Member,
  type MemberRole,
  type RowChange,
} from './duty';
import { getSupabase } from './supabase';

export type GroupInfo = {
  id: string;
  name: string;
  invite_code: string;
  owner_id: string;
};

type MemberRow = {
  user_id: string;
  role: MemberRole;
  profiles: { nickname: string } | null;
};

/**
 * 그룹 하나의 데이터(구성원, 그 달의 희망 신청·배정, 구성원들의 공개 일정)를 불러오고,
 * Supabase Realtime 으로 변경을 받아 화면에 바로 반영한다.
 * start, end 는 보고 있는 달의 첫날과 마지막날.
 */
export function useGroupData(groupId: string, start: string, end: string, enabled: boolean) {
  const [group, setGroup] = useState<GroupInfo | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [requests, setRequests] = useState<DutyRequest[]>([]);
  const [assignments, setAssignments] = useState<DutyAssignment[]>([]);
  const [events, setEvents] = useState<CalendarEvent[]>([]);
  const [membersLoaded, setMembersLoaded] = useState(false);
  const [ready, setReady] = useState(false);
  const [error, setError] = useState('');

  const loadMembers = useCallback(async () => {
    const { data, error: err } = await getSupabase()
      .from('group_members')
      .select('user_id, role, profiles(nickname)')
      .eq('group_id', groupId);
    if (err) {
      setError(err.message);
      return;
    }
    const rows = (data ?? []) as unknown as MemberRow[];
    setMembers(
      rows.map((r) => ({
        user_id: r.user_id,
        role: r.role,
        nickname: r.profiles?.nickname ?? '(알 수 없음)',
      })),
    );
    setMembersLoaded(true);
  }, [groupId]);

  const loadMonth = useCallback(
    async (memberIds: string[], isCancelled: () => boolean) => {
      const supabase = getSupabase();
      const [req, asg, ev] = await Promise.all([
        supabase
          .from('duty_requests')
          .select('id, group_id, user_id, request_date, shift_type, status, memo')
          .eq('group_id', groupId)
          .gte('request_date', start)
          .lte('request_date', end),
        supabase
          .from('duty_assignments')
          .select('id, group_id, duty_date, duty_name, shift_type, assignee_id, created_by')
          .eq('group_id', groupId)
          .gte('duty_date', start)
          .lte('duty_date', end),
        supabase
          .from('events')
          .select('id, user_id, type, title, start_date, end_date, visibility, memo')
          .in('user_id', memberIds)
          .lte('start_date', end)
          .gte('end_date', start),
      ]);
      if (isCancelled()) return;

      const failure = req.error ?? asg.error ?? ev.error;
      if (failure) {
        setError(failure.message);
        return;
      }
      setRequests((req.data ?? []) as DutyRequest[]);
      setAssignments((asg.data ?? []) as DutyAssignment[]);
      setEvents((ev.data ?? []) as CalendarEvent[]);
    },
    [groupId, start, end],
  );

  // 1. 그룹 정보와 구성원
  useEffect(() => {
    if (!enabled) return;
    let cancelled = false;

    getSupabase()
      .from('groups')
      .select('id, name, invite_code, owner_id')
      .eq('id', groupId)
      .single()
      .then(({ data, error: err }) => {
        if (cancelled) return;
        if (err || !data) {
          setError('그룹을 찾을 수 없거나 접근 권한이 없어요.');
        } else {
          setGroup(data as GroupInfo);
          void loadMembers();
        }
        setReady(true);
      });

    return () => {
      cancelled = true;
    };
  }, [enabled, groupId, loadMembers]);

  // 2. 구성원이 정해지거나 달이 바뀌면 그 달의 데이터를 다시 불러온다.
  useEffect(() => {
    if (!enabled || members.length === 0) return;
    let cancelled = false;
    void loadMonth(
      members.map((m) => m.user_id),
      () => cancelled,
    );
    return () => {
      cancelled = true;
    };
  }, [enabled, members, loadMonth]);

  // 3. 실시간 구독. 구독이 성립하면 한 번 새로 불러와서 그 사이의 변경도 놓치지 않는다.
  const refreshRef = useRef<() => void>(() => {});
  refreshRef.current = () => {
    void loadMembers();
  };

  useEffect(() => {
    if (!enabled) return;
    const supabase = getSupabase();

    const channel = supabase
      .channel(`group-${groupId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'duty_requests', filter: `group_id=eq.${groupId}` },
        (payload) => setRequests((list) => applyChange(list, payload as unknown as RowChange)),
      )
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'duty_assignments',
          filter: `group_id=eq.${groupId}`,
        },
        (payload) => setAssignments((list) => applyChange(list, payload as unknown as RowChange)),
      )
      // 일정은 그룹으로 거를 수 없어서 전체를 받는다. 볼 수 있는 행만 오고(RLS),
      // 화면에서 이 그룹 구성원의 것만 골라 쓴다.
      .on('postgres_changes', { event: '*', schema: 'public', table: 'events' }, (payload) =>
        setEvents((list) => applyChange(list, payload as unknown as RowChange)),
      )
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'group_members', filter: `group_id=eq.${groupId}` },
        () => refreshRef.current(),
      )
      .subscribe((status) => {
        if (String(status) === 'SUBSCRIBED') refreshRef.current();
      });

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [enabled, groupId]);

  /** 내가 데이터를 바꾼 뒤 바로 화면을 맞추고 싶을 때 쓴다. */
  const refresh = useCallback(() => {
    void loadMembers();
  }, [loadMembers]);

  return {
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
  };
}
