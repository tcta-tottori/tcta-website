// 役員ログイン（worker/auth.ts）の証明の検証を、自分で作った鍵で署名した証明で確かめる。
// Access のチームの公開鍵の取得（fetch）は差し替える。npm run test:auth
import { webcrypto as crypto } from 'node:crypto';
const { verifyAccessJwt, officerOf, handleAuth } = await import('../worker/auth.ts');
const kp = await crypto.subtle.generateKey({ name: 'RSASSA-PKCS1-v1_5', modulusLength: 2048, publicExponent: new Uint8Array([1, 0, 1]), hash: 'SHA-256' }, true, ['sign', 'verify']);
const jwk = { ...(await crypto.subtle.exportKey('jwk', kp.publicKey)), kid: 'k1' };
let certCalls = 0;
globalThis.fetch = (async (u: string) => { certCalls++; if (String(u) !== 'https://tcta.cloudflareaccess.com/cdn-cgi/access/certs') throw new Error('unexpected ' + u); return new Response(JSON.stringify({ keys: [jwk] })); }) as typeof fetch;
const b64 = (o: unknown) => Buffer.from(JSON.stringify(o)).toString('base64url');
async function sign(payload: object, kid = 'k1') {
  const head = b64({ alg: 'RS256', kid }); const body = b64(payload);
  const sig = await crypto.subtle.sign('RSASSA-PKCS1-v1_5', kp.privateKey, new TextEncoder().encode(`${head}.${body}`));
  return `${head}.${body}.${Buffer.from(sig).toString('base64url')}`;
}
const now = Math.floor(Date.now() / 1000);
const good = { iss: 'https://tcta.cloudflareaccess.com', aud: ['AUD123'], exp: now + 3600, email: 'Yakuin@Example.jp' };
const env: any = { ACCESS_TEAM_DOMAIN: 'tcta', ACCESS_AUD: 'AUD123' };
let failed = 0; const ok = (c: boolean, l: string) => { console.log(`${c ? '✓' : '✗'} ${l}`); if (!c) failed++; };
ok(await verifyAccessJwt(env, await sign(good)) === 'yakuin@example.jp', '正しい証明はメールアドレスを返す');
ok(await verifyAccessJwt(env, await sign({ ...good, aud: ['OTHER'] })) === null, '宛先（AUD）が違えば断る');
ok(await verifyAccessJwt(env, await sign({ ...good, iss: 'https://evil.cloudflareaccess.com' })) === null, '発行元が違えば断る');
ok(await verifyAccessJwt(env, await sign({ ...good, exp: now - 10 })) === null, '期限切れは断る');
const t = await sign(good); const parts = t.split('.');
ok(await verifyAccessJwt(env, `${parts[0]}.${b64({ ...good, email: 'evil@x.jp' })}.${parts[2]}`) === null, '中身を書き換えた証明は断る');
ok(await verifyAccessJwt(env, await sign(good, 'unknown')) === null, '知らない鍵の証明は断る');
ok(await verifyAccessJwt({ ACCESS_TEAM_DOMAIN: 'tcta.cloudflareaccess.com', ACCESS_AUD: 'AUD123' } as any, await sign(good)) === 'yakuin@example.jp', 'チーム名は tcta.cloudflareaccess.com の形でもよい');
const u = new URL('https://tcta-tournament.tcta-admin-worker.workers.dev/ws');
const req = (cookie: string) => new Request(u, { headers: { Cookie: cookie } });
ok((await officerOf(req(`__Host-tcta_officer=${t}`), env, u))?.email === 'yakuin@example.jp', 'Cookie の証明で役員と分かる');
ok(await officerOf(req(`__Host-tcta_officer=${t}`), { ...env, OFFICER_EMAILS: 'other@example.jp' }, u) === null, 'OFFICER_EMAILS に無い人は断る');
ok(await officerOf(req(`tcta_dev_officer=x@y.jp`), { ...env, AUTH_MODE: 'dev' }, u) === null, '本番の URL では手元用のログインは効かない');
const login = new URL('https://tcta-tournament.tcta-admin-worker.workers.dev/auth/login?return=/referee');
const res = await handleAuth(new Request(login, { headers: { 'Cf-Access-Jwt-Assertion': t } }), env, login);
ok(res.status === 302 && res.headers.get('Location') === '/referee' && (res.headers.get('Set-Cookie') || '').startsWith('__Host-tcta_officer='), 'Access を通ったら Cookie を付けて元の画面へ戻す');
const noJwt = await handleAuth(new Request(login), env, login);
ok(noJwt.status === 401, 'Access を通っていなければ /auth/login は断る');
console.log('certs fetched', certCalls, 'times');
process.exit(failed ? 1 : 0);
