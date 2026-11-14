// 서비스 워커: 앱 설치를 가능하게 하고, 연결이 끊겼을 때 안내 화면을 보여 준다.
// 로그인 정보·일정·근무표 같은 사용자 데이터는 절대 캐시하지 않는다.
//  - 같은 사이트의 정적 파일(/_next/static/)만 캐시한다. (파일 이름에 해시가 붙어 바뀌면 새 이름이 된다)
//  - 페이지 이동은 항상 네트워크를 먼저 쓰고, 실패했을 때만 offline.html 을 보여 준다.
//  - 다른 주소(Supabase API 등)로 가는 요청은 건드리지 않는다.

const CACHE = 'static-v1';
const OFFLINE_URL = '/offline.html';

self.addEventListener('install', (event) => {
  event.waitUntil(
    caches
      .open(CACHE)
      .then((cache) => cache.add(OFFLINE_URL))
      .then(() => self.skipWaiting()),
  );
});

self.addEventListener('activate', (event) => {
  event.waitUntil(
    caches
      .keys()
      .then((keys) =>
        Promise.all(keys.filter((key) => key !== CACHE).map((key) => caches.delete(key))),
      )
      .then(() => self.clients.claim()),
  );
});

self.addEventListener('fetch', (event) => {
  const request = event.request;
  if (request.method !== 'GET') return;

  const url = new URL(request.url);
  if (url.origin !== self.location.origin) return;

  if (request.mode === 'navigate') {
    event.respondWith(fetch(request).catch(() => caches.match(OFFLINE_URL)));
    return;
  }

  if (url.pathname.startsWith('/_next/static/')) {
    event.respondWith(
      caches.open(CACHE).then(async (cache) => {
        const cached = await cache.match(request);
        if (cached) return cached;
        const response = await fetch(request);
        if (response.ok) cache.put(request, response.clone());
        return response;
      }),
    );
  }
});
