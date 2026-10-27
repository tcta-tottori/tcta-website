// Stripe 決済リンク（Checkout Session）と Webhook の署名検証。
// STRIPE_SECRET_KEY が無いときは手元のシミュレータ（/dev/stripe/:id）に送る。
// シミュレータも本物と同じ署名方式（t=…,v1=HMAC-SHA256("t.payload")）で Webhook を叩くので検証コードは共通。
import { type Env, requireSecret } from '../env';
import { hmacHex, timingSafeEqual } from './crypto';

export interface CheckoutTarget {
  paymentId: string;
  amount: number;
  description: string;
  successUrl: string;
  cancelUrl: string;
  customerEmail?: string | null;
}

export async function createCheckoutUrl(env: Env, t: CheckoutTarget): Promise<{ url: string; sessionId: string }> {
  if (!env.STRIPE_SECRET_KEY) {
    return { url: `/dev/stripe/${t.paymentId}`, sessionId: `cs_sim_${t.paymentId}` };
  }
  const form = new URLSearchParams();
  form.set('mode', 'payment');
  form.set('success_url', t.successUrl);
  form.set('cancel_url', t.cancelUrl);
  form.set('client_reference_id', t.paymentId);
  form.set('metadata[payment_id]', t.paymentId);
  form.set('line_items[0][quantity]', '1');
  form.set('line_items[0][price_data][currency]', 'jpy');
  form.set('line_items[0][price_data][unit_amount]', String(t.amount));
  form.set('line_items[0][price_data][product_data][name]', t.description);
  form.append('payment_method_types[]', 'card');
  form.append('payment_method_types[]', 'konbini');
  form.append('payment_method_types[]', 'customer_balance');
  form.set('payment_method_options[customer_balance][funding_type]', 'bank_transfer');
  form.set('payment_method_options[customer_balance][bank_transfer][type]', 'jp_bank_transfer');
  if (t.customerEmail) form.set('customer_email', t.customerEmail);
  const res = await fetch('https://api.stripe.com/v1/checkout/sessions', {
    method: 'POST',
    headers: { Authorization: `Bearer ${env.STRIPE_SECRET_KEY}`, 'Content-Type': 'application/x-www-form-urlencoded' },
    body: form.toString(),
  });
  const body = (await res.json()) as { id?: string; url?: string; error?: { message: string } };
  if (!res.ok || !body.url || !body.id) throw new Error(`Stripe: ${body.error?.message ?? res.status}`);
  return { url: body.url, sessionId: body.id };
}

/** Stripe-Signature ヘッダーを検証する。tolerance は 5 分。 */
export async function verifyStripeSignature(env: Env, payload: string, header: string | undefined, toleranceSec = 300): Promise<boolean> {
  if (!header) return false;
  const secret = requireSecret(env, 'STRIPE_WEBHOOK_SECRET');
  const parts = Object.fromEntries(header.split(',').map((kv) => kv.split('=') as [string, string]));
  const t = parts['t'];
  const v1 = parts['v1'];
  if (!t || !v1) return false;
  if (Math.abs(Math.floor(Date.now() / 1000) - Number(t)) > toleranceSec) return false;
  const expected = await hmacHex(secret, `${t}.${payload}`);
  return timingSafeEqual(expected, v1);
}

export async function signStripePayload(env: Env, payload: string, t = Math.floor(Date.now() / 1000)): Promise<string> {
  const secret = requireSecret(env, 'STRIPE_WEBHOOK_SECRET');
  return `t=${t},v1=${await hmacHex(secret, `${t}.${payload}`)}`;
}
