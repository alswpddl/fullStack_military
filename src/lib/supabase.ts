import { createClient, type SupabaseClient } from '@supabase/supabase-js';

// 환경 변수가 없을 때 빌드(서버 렌더링) 단계에서 바로 죽지 않도록,
// 실제로 쓰는 시점(이벤트·효과 안)에 클라이언트를 만든다.
let client: SupabaseClient | null = null;

export function getSupabase(): SupabaseClient {
  if (client) return client;

  const url = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !key) {
    throw new Error(
      'NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY 환경 변수를 설정해 주세요.',
    );
  }

  client = createClient(url, key);
  return client;
}
