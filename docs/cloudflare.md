# Cloudflare 導入の検討メモ

2026-09-03 時点の整理。対象は「Cloudflare（Pages／Workers／Wrangler）を、Claude Code などの
AI コーディングツールと組み合わせて使う」という提案について、このサイトにとって何が変わるかを見たもの。

## いまの構成

- Astro で静的 HTML を生成し、GitHub Pages で公開（`.github/workflows/deploy.yml`）。
- 出力は素の HTML／CSS／JS と画像・PDF だけ。サーバー側の処理は無い。
- リンクはすべて相対パスなので、置き場所（ホスト）を変えても HTML は触らずに済む。
- お問い合わせフォームは入力検証と完了画面までで、**送信先が無い**（README「公開前に差し替えが必要なもの」4）。
- 現行サイト（https://www.tottori-tenis.net/）は Jimdo。独自ドメインの DNS をどこで管理しているかは要確認。

## Cloudflare に移すと何が変わるか

| 項目 | GitHub Pages（現状） | Cloudflare Pages |
| --- | --- | --- |
| 費用 | 無料 | 無料（Free プラン） |
| 独自ドメイン・SSL | 可 | 可（DNS も Cloudflare に置くと設定が一番楽） |
| 配信 | GitHub の CDN。目安 100GB/月 | Cloudflare の CDN。帯域の上限なし |
| ビルド | GitHub Actions | Cloudflare 側で `npm run build` を実行（GitHub 連携） |
| プレビュー | 無し（main に push すると本番） | ブランチごとにプレビュー URL が出る |
| サーバー側処理 | 不可 | **Pages Functions（Workers）で可** |
| 上限 | 1GB／リポジトリ | 2万ファイル、1ファイル 25MB |

このサイトで効くのは次の3点。

1. **お問い合わせフォームの送信先が作れる。** Pages Functions（Workers）でフォームの POST を受け、
   メール送信 API（Resend など）へ渡す。あわせて Turnstile（無料の bot 対策）を置ける。
   いま唯一「静的サイトでは作れない」機能がこれなので、Cloudflare を使う最大の理由になる。
2. **ブランチごとのプレビュー URL。** 協会の方に「この見た目でよいか」を本番に出す前に見てもらえる。
   今は `npm run preview` を手元で開くしかない。
3. **独自ドメインへの移行が一体で済む。** Jimdo から `tottori-tenis.net` を引き上げるとき、
   DNS を Cloudflare に置けば、Pages への向け先変更と SSL が同じ画面で終わる。

逆に、いま困っていることは特に無いので、**急いで移す必要はない**。

## Wrangler と Claude Code の組み合わせ

- Wrangler は Cloudflare の CLI。`npx wrangler pages deploy dist` で手元から公開でき、
  `npx wrangler pages dev dist` で Functions 込みの動作を手元で再現できる。
- Claude Code から見ると「`npm run build` のあとに `wrangler` を叩く」だけなので、
  今の作業の流れ（データを直す → ビルド → 確認 → push）はそのまま。
  Functions を書くときも、`functions/api/contact.ts` のような1ファイルを足すだけで済む。
- API トークンは `wrangler login`（ブラウザ認証）で持たせる。トークンをリポジトリに置かない。

## 進めるなら（段階案）

1. Cloudflare アカウントを協会名義（または担当者名義）で作る。
2. Cloudflare Pages で GitHub の `tcta-tottori/tcta-website` を連携。
   ビルドコマンド `npm run build`、出力 `dist`。Node は 20 以上。
3. 発行される `*.pages.dev` の URL で全ページを確認（相対パス設計なので追加設定は不要）。
4. `functions/api/contact.ts` を足してお問い合わせフォームを繋ぐ（Resend＋Turnstile）。
   `src/pages/contact.astro` の送信先をこの API に向ける。
5. DNS を Cloudflare に移し、`www.tottori-tenis.net` を Pages に向ける。Jimdo 側を止める。
6. GitHub Pages の公開を止める（`deploy.yml` は残してもよいが、二重公開は避ける）。

1〜3 は 1 時間ほど。4 は半日。5 はドメインの管理者が誰かで前後する。

## 結論

- **今すぐは GitHub Pages のままでよい。** 静的サイトとしては差が無い。
- **お問い合わせフォームを繋ぐ段階で Cloudflare Pages に移す**のが、一番手戻りが少ない。
  フォーム以外はいまの作り方を何も変えずに済む。
- ドメイン移行（Jimdo からの引き上げ）と同じタイミングにそろえると、DNS の作業が1回で終わる。
