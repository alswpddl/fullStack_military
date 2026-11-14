'use client';

import type { Session } from '@supabase/supabase-js';
import { useEffect, useState } from 'react';
import { getSupabase } from './supabase';

/** 현재 로그인 세션. loading 이 true 인 동안은 로그인 여부를 아직 모르는 상태. */
export function useSession() {
  const [session, setSession] = useState<Session | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const supabase = getSupabase();

    supabase.auth.getSession().then(({ data }) => {
      setSession(data.session);
      setLoading(false);
    });

    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      setSession(next);
    });

    return () => listener.subscription.unsubscribe();
  }, []);

  return { session, loading };
}
