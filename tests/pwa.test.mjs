import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { existsSync, readFileSync } from 'node:fs';
import { test } from 'node:test';

const publicDir = new URL('../public/', import.meta.url);
const read = (name) => readFileSync(new URL(name, publicDir));

/** PNG 헤더에서 가로·세로 크기를 읽는다. */
function pngSize(buffer) {
  const signature = '89504e470d0a1a0a';
  assert.equal(buffer.subarray(0, 8).toString('hex'), signature, 'PNG 파일이 아닙니다');
  return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
}

test('매니페스트: 설치에 필요한 항목', () => {
  const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));
  assert.ok(manifest.name && manifest.short_name);
  assert.equal(manifest.start_url, '/');
  assert.equal(manifest.display, 'standalone');
  assert.match(manifest.theme_color, /^#[0-9a-f]{6}$/i);
  assert.match(manifest.background_color, /^#[0-9a-f]{6}$/i);

  const sizes = manifest.icons.map((i) => i.sizes);
  assert.ok(sizes.includes('192x192'), '192 아이콘이 필요합니다');
  assert.ok(sizes.includes('512x512'), '512 아이콘이 필요합니다');
  assert.ok(manifest.icons.some((i) => i.purpose === 'maskable'), '마스커블 아이콘이 필요합니다');
});

test('매니페스트가 가리키는 아이콘 파일이 있고 크기가 맞다', () => {
  const manifest = JSON.parse(read('manifest.webmanifest').toString('utf8'));
  for (const icon of manifest.icons) {
    const file = icon.src.replace(/^\//, '');
    assert.ok(existsSync(new URL(file, publicDir)), `${icon.src} 파일이 없습니다`);
    const [w, h] = icon.sizes.split('x').map(Number);
    assert.deepEqual(pngSize(read(file)), { width: w, height: h }, `${icon.src} 크기가 다릅니다`);
  }
  assert.deepEqual(pngSize(read('apple-touch-icon.png')), { width: 180, height: 180 });
});

test('서비스 워커: 문법이 올바르고 사용자 데이터를 캐시하지 않는 구조', () => {
  execFileSync(process.execPath, ['--check', new URL('sw.js', publicDir).pathname]);

  const sw = read('sw.js').toString('utf8');
  assert.match(sw, /request\.method !== 'GET'/, 'GET 이외 요청은 건드리지 않아야 합니다');
  assert.match(sw, /url\.origin !== self\.location\.origin/, '다른 주소 요청은 건드리지 않아야 합니다');
  assert.match(sw, /\/_next\/static\//, '정적 파일만 캐시해야 합니다');
  assert.equal(sw.includes('supabase'), false, 'Supabase 요청을 캐시하면 안 됩니다');
});

test('오프라인 페이지가 있다', () => {
  const html = read('offline.html').toString('utf8');
  assert.match(html, /<html lang="ko">/);
  assert.match(html, /다시 시도/);
});
