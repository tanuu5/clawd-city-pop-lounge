#!/usr/bin/env node
// record-video.mjs — 作業用 BGM 動画を録る（実時間）。
//
//   npm run dev                                   # 開発サーバー（/__append で書き出しを受け取る）
//   node dev/record-video.mjs --minutes 60        # shots/video/lounge-60min.mp4 と chapters.txt ができる
//
// ヘッドレス Chrome（Mac の実 GPU）で ?video=<分> を開き、MediaRecorder（H.264 / AAC）で
// キャンバスと音をそのまま録る。指定の長さが近づくと、今の曲の終わりで Clawd が眠り、暗転して止まる。
// 録画は実時間なので、60 分の動画には 60 分ほどかかる。音はスピーカーからは鳴らない（--mute-audio）。

import puppeteer from 'puppeteer-core';
import { existsSync, writeFileSync, mkdirSync } from 'node:fs';
import path from 'node:path';

const arg = (n, d) => { const i = process.argv.indexOf(`--${n}`); return i >= 0 ? process.argv[i + 1] : d; };
const minutes = +arg('minutes', 60);
const base = arg('url', 'http://127.0.0.1:5183/');
const name = arg('name', `video/lounge-${minutes}min.mp4`);
const seekTo = arg('seek', null); // 確認用：最初の曲の何秒目へ飛ぶか
const vbr = +arg('vbr', 10e6);

const CHROME = [process.env.CHROME_PATH, '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome', '/Applications/Chromium.app/Contents/MacOS/Chromium']
  .filter(Boolean).find((p) => existsSync(p));
if (!CHROME) throw new Error('Chrome が見つかりません（CHROME_PATH で指定）');

const browser = await puppeteer.launch({
  executablePath: CHROME,
  headless: true,
  protocolTimeout: 0,
  args: ['--use-angle=metal', '--enable-gpu', '--ignore-gpu-blocklist', '--force-color-profile=srgb',
    '--disable-background-timer-throttling', '--disable-renderer-backgrounding', '--disable-backgrounding-occluded-windows',
    '--mute-audio', '--autoplay-policy=no-user-gesture-required', '--window-size=1920,1080'],
});
const page = await browser.newPage();
await page.setViewport({ width: 1920, height: 1080, deviceScaleFactor: 1 });
page.on('pageerror', (e) => console.log('[page error]', e.message));
page.on('console', (m) => { if (m.type() === 'error') console.log('[page]', m.text()); });
await page.goto(`${base}?video=${minutes}`, { waitUntil: 'load', timeout: 120000 });
await page.waitForFunction('window.__video?.state.ready && window.__dev?.ready', { timeout: 120000, polling: 200 });
await page.evaluate(() => document.fonts.ready);
await new Promise((r) => setTimeout(r, 2500)); // 最初の環境マップを撮り終えるまで

const started = Date.now();
await page.evaluate((name, vbr) => { window.__video.record(name, { vbr }); }, name, vbr);
await page.evaluate(() => window.__video.begin());
if (seekTo) {
  await new Promise((r) => setTimeout(r, 12000));
  await page.evaluate((s) => window.__dev.music.load(0, +s), seekTo);
}
console.log(`録画開始：${name}（${minutes} 分の予定）`);

let last = '';
for (;;) {
  await new Promise((r) => setTimeout(r, 5000));
  const s = await page.evaluate(() => window.__video.status());
  const line = `${(s.t / 60).toFixed(1)} 分  ${s.phase}  ${s.track ?? '-'}${s.ending ? '  （終わり）' : ''}`;
  if (line !== last) { console.log(line); last = line; }
  if (s.done) break;
  if ((Date.now() - started) / 1000 > minutes * 60 + 15 * 60) { console.log('時間を超えたので止めます'); break; }
}
await page.evaluate(() => window.__video.finish());
const log = await page.evaluate(() => window.__video.state.log);
const fmt = (t) => { t = Math.max(0, Math.floor(t)); const h = Math.floor(t / 3600), m = Math.floor((t % 3600) / 60), s = t % 60; return (h ? `${h}:${String(m).padStart(2, '0')}` : `${m}`) + `:${String(s).padStart(2, '0')}`; };
const lines = log.map((x, i) => `${i === 0 ? '0:00' : fmt(x.at)} ${String(x.no).padStart(2, '0')}. ${x.title}（${x.titleJa}）`);
const out = path.join('shots', path.dirname(name));
mkdirSync(out, { recursive: true });
writeFileSync(path.join(out, path.basename(name, '.mp4') + '-chapters.txt'), lines.join('\n') + '\n');
writeFileSync(path.join(out, path.basename(name, '.mp4') + '-log.json'), JSON.stringify(log, null, 2));
console.log(lines.join('\n'));
await browser.close();
