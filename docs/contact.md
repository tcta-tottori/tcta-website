# お問い合わせフォーム（contact.html）

フォームの送信は `POST /api/contact`（`src/pages/api/contact.ts`）が受ける。

1. 入力を確かめる（必須・長さ・メールアドレスの形）。他のサイトからの送信は断り、見えない欄（ボット避け）に
   何か入っていたら捨てる。同じ送信元からの連投は 10 分に 5 件まで。
2. **届いた内容を D1 の `contact_messages` に必ず保存する**（メールが送れなくても失われない）。
3. **Resend**（メール送信サービス）で `CONTACT_TO`（`wrangler.jsonc` の vars。今は t.c.t.a.r7@gmail.com）へ送る。
   返信先（Reply-To）はお問い合わせした人のアドレスなので、届いたメールにそのまま返信すればよい。

送れたかどうかは `contact_messages` の `mailed`（1＝送れた）と `mail_error`（送れなかった理由）に残る。

## はじめに1回だけ：Resend の鍵を入れる

鍵（`RESEND_API_KEY`）が入るまでは、メールは送られず、保存だけされる。

1. https://resend.com/signup で、**t.c.t.a.r7@gmail.com** でアカウントを作る。
   （送り主に独自のドメインを使わないあいだは、Resend の送り主 `onboarding@resend.dev` から
   **アカウントのメールアドレスあてにしか送れない**。送り先と同じアドレスで作ること）
2. Resend の管理画面の **API Keys** → **Create API Key**。権限は「Sending access」でよい。表示された `re_…` の鍵を控える
   （一度しか表示されない）。
3. Cloudflare のダッシュボード（t.c.t.a.r7@gmail.com のアカウント）→ **Workers & Pages** → **tcta-site** →
   **Settings** → **Variables and Secrets** → **Add**。
   Type は **Secret**、Variable name は `RESEND_API_KEY`、Value に 2 の鍵を貼って保存（Deploy）する。
   手元から入れるなら `npx wrangler secret put RESEND_API_KEY`。
4. お問い合わせのページから試しに送り、t.c.t.a.r7@gmail.com に届くことを確かめる（迷惑メールのフォルダも見る）。

シークレットは配備（`wrangler deploy`）では消えない。

## 届いた内容を後から読む（メールが届かなかったときなど）

Cloudflare のダッシュボード → **Storage & Databases** → **D1** → **tcta-site** → **Console** で：

```sql
SELECT id, created_at, name, email, type, event, body, mailed, mail_error
FROM contact_messages ORDER BY id DESC LIMIT 50;
```

`created_at` は世界標準時（日本時間は +9 時間）。

## 送り先や送り主を変える

- 送り先：`wrangler.jsonc` の `vars.CONTACT_TO`。Resend の送り主が `onboarding@resend.dev` のあいだは、
  Resend のアカウントのアドレスにしか送れない。
- 送り主：独自のドメイン（例 tottori-tenis.net）を Resend の **Domains** で認証したら、
  `CONTACT_FROM`（例 `鳥取市テニス協会 <info@tottori-tenis.net>`）を vars に足す。そうすれば送り先も自由に選べる。
