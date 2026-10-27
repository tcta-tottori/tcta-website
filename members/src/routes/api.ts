// 外部連携 API。公式サイト向けの大会一覧（公開）、大会運営アプリ向けのエントリー JSON（トークン）、Stripe Webhook。
// エントリー JSON には氏名・クラブ・クラスだけを含め、住所・電話・メールの列は API に存在しない（設計書 §7.1）。
import { Hono } from 'hono';
import type { Env } from '../env';
import { audit } from '../lib/audit';
import { sha256Hex } from '../lib/crypto';
import { all, nowIso, one, run } from '../lib/db';
import { verifyStripeSignature } from '../lib/stripe';
import { getPayment, markPaid } from '../services/payments';
import type { Association, Tournament, TournamentEvent } from '../types';
import { describeRule, parseRule } from '../services/eligibility';

export const api = new Hono<{ Bindings: Env }>();

api.get('/v1/health', (c) => c.json({ ok: true, env: c.env.APP_ENV, at: nowIso() }));

api.get('/v1/tournaments', async (c) => {
  const assocs = await all<Association>(c.env.DB, 'SELECT * FROM associations ORDER BY id');
  const rows = await all<Tournament & { association_name: string }>(
    c.env.DB,
    `SELECT t.*, a.name AS association_name FROM tournaments t JOIN associations a ON a.id = t.association_id WHERE t.status IN ('open','closed') ORDER BY t.held_on`,
  );
  return c.json({
    tournaments: rows.map((t) => ({
      id: t.id, name: t.name, association: t.association_name, heldOn: t.held_on, venue: t.venue, entryStart: t.entry_start, entryEnd: t.entry_end,
      status: t.status,
      eligibility: { description: describeRule(parseRule(t), assocs, t.held_on), rule: parseRule(t), partnerRule: t.partner_rule, note: t.eligibility },
      events: (JSON.parse(t.events_json) as TournamentEvent[]).map((e) => ({ code: e.code, name: e.name, classes: e.classes, fee: e.fee })),
      entryUrl: `${c.env.BASE_URL}/tournaments/${t.id}`,
    })),
  });
});

/** 大会運営・ドロー・ライブスコアアプリが読む確定エントリー。Bearer か ?token= の読み取り専用トークン（大会単位・有効期限付き）。 */
api.get('/v1/tournaments/:id/entries.json', async (c) => {
  const auth = c.req.header('Authorization');
  const token = auth?.startsWith('Bearer ') ? auth.slice(7) : c.req.query('token');
  if (!token) return c.json({ error: 'token required' }, 401);
  const h = await sha256Hex(token);
  const row = await one<{ tournament_id: string; expires_at: string; label: string | null }>(c.env.DB, 'SELECT tournament_id, expires_at, label FROM api_tokens WHERE token_hash = ?', h);
  if (!row || row.tournament_id !== c.req.param('id') || row.expires_at < nowIso()) return c.json({ error: 'invalid token' }, 403);
  await run(c.env.DB, 'UPDATE api_tokens SET last_used_at = ? WHERE token_hash = ?', nowIso(), h);
  const t = await one<Tournament>(c.env.DB, 'SELECT * FROM tournaments WHERE id = ?', row.tournament_id);
  if (!t) return c.json({ error: 'not found' }, 404);
  const events = JSON.parse(t.events_json) as TournamentEvent[];
  const rows = await all<{ id: string; event_code: string; class: string | null; p1: string; p1_club: string | null; p2: string | null; p2_club: string | null }>(
    c.env.DB,
    `SELECT e.id, e.event_code, e.class, m1.name AS p1, c1.name AS p1_club, m2.name AS p2, c2.name AS p2_club
       FROM entries e
       JOIN members m1 ON m1.id = e.member_id LEFT JOIN clubs c1 ON c1.id = m1.club_id
       LEFT JOIN members m2 ON m2.id = e.partner_member_id LEFT JOIN clubs c2 ON c2.id = m2.club_id
      WHERE e.tournament_id = ? AND e.status = 'confirmed' ORDER BY e.event_code, e.class, e.confirmed_at`,
    t.id,
  );
  await audit(c.env, { actorType: 'api', actor: `token:${row.label ?? h.slice(0, 8)}`, action: 'api.entries_export', target: `tournament:${t.id}`, after: { count: rows.length } });
  return c.json({
    tournament: { id: t.id, name: t.name, heldOn: t.held_on, venue: t.venue, status: t.status },
    generatedAt: nowIso(),
    entries: rows.map((r) => ({
      id: r.id,
      event: events.find((e) => e.code === r.event_code)?.name ?? r.event_code,
      eventCode: r.event_code,
      class: r.class,
      players: [{ name: r.p1, club: r.p1_club }, ...(r.p2 ? [{ name: r.p2, club: r.p2_club }] : [])],
    })),
  });
});

/** Stripe Webhook。署名検証 → 金額・通貨・支払 ID の突合 → 消込（冪等）。 */
api.post('/webhooks/stripe', async (c) => {
  const raw = await c.req.text();
  return handleStripeWebhook(c.env, raw, c.req.header('Stripe-Signature'), c.req.header('CF-Connecting-IP') ?? null).then((r) => c.json(r.body, r.status as 200));
});

export async function handleStripeWebhook(env: Env, raw: string, signature: string | undefined, ip: string | null): Promise<{ status: number; body: unknown }> {
  if (!(await verifyStripeSignature(env, raw, signature))) {
    await audit(env, { actorType: 'system', actor: 'stripe:webhook', action: 'webhook.rejected', after: { reason: 'bad signature' }, ip });
    return { status: 400, body: { error: 'invalid signature' } };
  }
  const event = JSON.parse(raw) as { type: string; data: { object: { id: string; amount_total?: number; currency?: string; payment_status?: string; metadata?: Record<string, string>; client_reference_id?: string } } };
  if (event.type !== 'checkout.session.completed') return { status: 200, body: { received: true, ignored: event.type } };
  const s = event.data.object;
  const paymentId = s.metadata?.payment_id ?? s.client_reference_id;
  if (!paymentId) return { status: 400, body: { error: 'payment_id missing' } };
  const p = await getPayment(env, paymentId);
  if (!p) return { status: 404, body: { error: 'payment not found' } };
  if (s.currency !== 'jpy' || s.amount_total !== p.amount || s.payment_status !== 'paid') {
    await audit(env, { actorType: 'system', actor: 'stripe:webhook', action: 'webhook.mismatch', target: `payment:${p.id}`, after: { amount_total: s.amount_total, currency: s.currency, expected: p.amount, payment_status: s.payment_status }, ip });
    return { status: 400, body: { error: 'amount/currency mismatch' } };
  }
  await markPaid(env, p.id, { actorType: 'system', actor: 'stripe:webhook', externalId: s.id, ip });
  return { status: 200, body: { received: true, paymentId: p.id } };
}
