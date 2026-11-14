'use client';

import { useEffect } from 'react';

/** 배포된 앱에서만 서비스 워커를 등록한다. (개발 중에는 캐시 때문에 헷갈리지 않도록 끈다) */
export default function ServiceWorkerRegister() {
  useEffect(() => {
    if (process.env.NODE_ENV !== 'production') return;
    if (!('serviceWorker' in navigator)) return;

    navigator.serviceWorker.register('/sw.js').catch(() => {
      // 등록에 실패해도 앱은 평소처럼 동작한다.
    });
  }, []);

  return null;
}
