// 通知メール。Email Sending のバインディング（MAIL）があれば Workers から直接送る。
// 無いとき（手元の開発モード）は mail_outbox に貯め、/dev/mailbox で読める。
import type { Env } from '../env';
import { nowIso, run } from './db';
import { ulid } from './ulid';

export interface Mail {
  to: string;
  subject: string;
  text: string;
}

export async function sendMail(env: Env, mail: Mail): Promise<void> {
  if (env.MAIL) {
    try {
      // Cloudflare Email Sending（send_email バインディング）。MIME を組んで送る。
      const { EmailMessage } = (await import('cloudflare:email' as string)) as { EmailMessage: new (from: string, to: string, raw: string) => unknown };
      const from = env.MAIL_FROM ?? 'noreply@example.com';
      const subject = `=?UTF-8?B?${btoa(unescape(encodeURIComponent(mail.subject)))}?=`;
      const raw = [
        `From: ${env.APP_NAME} <${from}>`,
        `To: ${mail.to}`,
        `Subject: ${subject}`,
        'MIME-Version: 1.0',
        'Content-Type: text/plain; charset=UTF-8',
        'Content-Transfer-Encoding: 8bit',
        '',
        mail.text,
      ].join('\r\n');
      await env.MAIL.send(new EmailMessage(from, mail.to, raw));
      return;
    } catch (e) {
      console.error('mail send failed, falling back to outbox', e);
    }
  }
  console.log(`[mail] to=${mail.to} subject=${mail.subject}\n${mail.text}`);
  await run(env.DB, 'INSERT INTO mail_outbox (id, to_addr, subject, body, created_at) VALUES (?, ?, ?, ?, ?)', ulid(), mail.to, mail.subject, mail.text, nowIso());
}
