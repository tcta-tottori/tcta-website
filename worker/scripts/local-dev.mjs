// 手元で管理アプリを動かす（Cloudflare も GitHub も使わない）。
//
//   node scripts/local-dev.mjs
//   → http://localhost:8788/  ログイン名 test / パスワード localtest123
//
// ・KV の代わりにメモリ、GitHub の代わりに手元の git（このリポジトリを一時フォルダに clone）を使う。
//   「公開」を押すと、その clone に本物のコミットが積まれる。本物の main には触れない。
// ・公開サイト（SITE_URL）は Astro の開発サーバー（http://localhost:4321/）。
//   `npm run dev` を別に動かしておくと、プレビューが CSS と公開ずみ画像を読める。
import http from 'node:http';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { execFileSync } from 'node:child_process';
import worker from '../src/index.js';
import { hashPassword } from '../src/auth.js';

const ROOT = path.resolve(path.dirname(new URL(import.meta.url).pathname), '../..');
const ADMIN = path.join(ROOT, 'admin');
const PORT = Number(process.env.PORT || 8788);

/* ---- KV の代わり ---- */
class MemKV {
  constructor() { this.map = new Map(); }
  async get(key, type) {
    const v = this.map.get(key);
    if (!v) return null;
    if (type === 'json') return JSON.parse(v.value);
    if (type === 'arrayBuffer') return v.value;
    return v.value;
  }
  async getWithMetadata(key, type) { return { value: await this.get(key, type), metadata: this.map.get(key)?.metadata ?? null }; }
  async put(key, value, opts = {}) { this.map.set(key, { value, metadata: opts.metadata }); }
  async delete(key) { this.map.delete(key); }
}

/* ---- GitHub の代わり：一時フォルダの clone に git で読み書き ---- */
class LocalRepo {
  constructor(dir) { this.dir = dir; }
  git(args, opts = {}) { return execFileSync('git', args, { cwd: this.dir, encoding: opts.binary ? 'buffer' : 'utf8', maxBuffer: 1 << 28, ...opts }); }
  async readText(p, ref = 'HEAD') {
    try { return { text: this.git(['show', `${ref}:${p}`]), sha: this.git(['rev-parse', `${ref}:${p}`]).trim() }; } catch { return null; }
  }
  async readJson(p, ref) { const r = await this.readText(p, ref); return r ? { data: JSON.parse(r.text), sha: r.sha } : null; }
  async commit({ message, author, files }) {
    for (const f of files) {
      const abs = path.join(this.dir, f.path);
      if (f.delete) { fs.rmSync(abs, { force: true }); this.git(['rm', '-q', '--cached', '--ignore-unmatch', f.path]); continue; }
      fs.mkdirSync(path.dirname(abs), { recursive: true });
      fs.writeFileSync(abs, f.base64 !== undefined ? Buffer.from(f.base64, 'base64') : f.text);
      this.git(['add', f.path]);
    }
    this.git(['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-q', '-m', message]);
    return this.git(['rev-parse', 'HEAD']).trim();
  }
  async changedFiles(sha) {
    const out = this.git(['show', '--name-status', '--format=%H%n%P%n%s', sha]).split('\n');
    return { sha: out[0], parent: out[1].split(' ')[0] || null, message: out[2], files: out.slice(3).filter(Boolean).map((l) => { const [st, a, b] = l.split('\t'); return { path: b || a, status: st[0] === 'A' ? 'added' : st[0] === 'D' ? 'removed' : st[0] === 'R' ? 'renamed' : 'modified', previous: b ? a : undefined }; }) };
  }
  async revert({ sha, message, author }) {
    this.git(['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'revert', '--no-edit', sha]);
    this.git(['-c', `user.name=${author.name}`, '-c', `user.email=${author.email}`, 'commit', '-q', '--amend', '-m', message]);
    return this.git(['rev-parse', 'HEAD']).trim();
  }
  async deployStatus(sha) {
    // 手元には GitHub Actions が無いので、コミットから 6 秒で「公開完了」にする
    const t = Number(this.git(['show', '-s', '--format=%ct', sha]).trim()) * 1000;
    return Date.now() - t > 6000 ? { state: 'done' } : { state: 'running' };
  }
}

const cloneDir = process.env.LOCAL_REPO || fs.mkdtempSync(path.join(os.tmpdir(), 'tcta-admin-'));
if (!fs.existsSync(path.join(cloneDir, '.git'))) {
  execFileSync('git', ['clone', '-q', '--local', ROOT, cloneDir]);
  console.log('clone:', cloneDir);
}

const env = {
  DRAFTS: new MemKV(),
  __repo: new LocalRepo(cloneDir),
  SESSION_SECRET: 'local-dev-secret-not-for-production',
  EDITORS: JSON.stringify({ test: await hashPassword('localtest123') }),
  GITHUB_REPO: 'local', GITHUB_BRANCH: 'main',
  SITE_URL: process.env.SITE_URL || 'http://localhost:4321/',
  COMMIT_EMAIL: 'admin@example.com',
  ASSETS: {
    async fetch(request) {
      const url = new URL(request.url);
      let p = decodeURIComponent(url.pathname);
      if (p === '/' || !fs.existsSync(path.join(ADMIN, p)) || fs.statSync(path.join(ADMIN, p)).isDirectory()) p = '/index.html';
      const file = path.join(ADMIN, p);
      const types = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript', '.css': 'text/css', '.json': 'application/json', '.webmanifest': 'application/manifest+json', '.png': 'image/png', '.svg': 'image/svg+xml' };
      return new Response(fs.readFileSync(file), { headers: { 'Content-Type': types[path.extname(file)] || 'application/octet-stream', 'Cache-Control': 'no-store' } });
    },
  },
};

http.createServer(async (req, res) => {
  const chunks = [];
  for await (const c of req) chunks.push(c);
  const body = chunks.length ? Buffer.concat(chunks) : undefined;
  const request = new Request(`http://localhost:${PORT}${req.url}`, { method: req.method, headers: req.headers, body: body && req.method !== 'GET' && req.method !== 'HEAD' ? body : undefined });
  const response = await worker.fetch(request, env);
  res.writeHead(response.status, Object.fromEntries(response.headers));
  res.end(Buffer.from(await response.arrayBuffer()));
}).listen(PORT, () => console.log(`管理アプリ（手元用）: http://localhost:${PORT}/  （test / localtest123）`));
