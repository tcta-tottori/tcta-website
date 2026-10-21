// 協会の SNS（YouTube・Instagram など）。
// アカウント名は EmDash の管理画面 → Settings → Social に入れる（src/lib/cms.js が読む）。
// ここでは、入れられた値（@tcta のようなハンドル、または URL そのもの）を公開 URL に直す。
// 値が空のサービスは出ない。フッターとリンク集の「協会の公式アカウント」に並ぶ。

// ハンドルは日本語のこともある（YouTube の @鳥取市テニス協会 など）ので、URL に入れる形に直す
const handle = (v) => encodeURIComponent(String(v).trim().replace(/^@/, '').replace(/^https?:\/\/[^/]+\//, '').replace(/\/+$/, ''));
const isUrl = (v) => /^https?:\/\//i.test(String(v).trim());

/** 出す順に並べる。label はそのまま文字として出る。 */
export const SOCIAL_SERVICES = [
  { key: 'youtube', label: 'YouTube', desc: '大会や教室の動画を配信中', url: (v) => (isUrl(v) ? v : `https://www.youtube.com/@${handle(v)}`) },
  { key: 'instagram', label: 'Instagram', desc: '大会・教室の写真を投稿中', url: (v) => (isUrl(v) ? v : `https://www.instagram.com/${handle(v)}/`) },
  { key: 'twitter', label: 'X', desc: '最新のお知らせ', url: (v) => (isUrl(v) ? v : `https://x.com/${handle(v)}`) },
  { key: 'facebook', label: 'Facebook', desc: '協会の活動', url: (v) => (isUrl(v) ? v : `https://www.facebook.com/${handle(v)}`) },
];

/**
 * 管理画面の Social 設定から、出すものだけを並べる。
 *   SOCIAL … [{ key, label, desc, url, name }]（name はリンク集のカード用「鳥取市テニス協会 YouTube」）
 */
export function buildSocial(social) {
  const SOCIAL = SOCIAL_SERVICES
    .filter((s) => social?.[s.key] && String(social[s.key]).trim())
    .map((s) => ({ key: s.key, label: s.label, desc: s.desc, url: s.url(social[s.key]), name: `鳥取市テニス協会 ${s.label}` }));
  return { SOCIAL };
}
