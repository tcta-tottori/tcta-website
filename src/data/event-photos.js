// 種目の写真。トップの大会カードの上に敷く（ピクトグラムの代わり）。
//
// 画像は public/assets/img/event-photos/<key>.webp（幅 960px・3:2）。key は event-icons.js と同じ：
//   s … シングルス／d … ダブルス／x … ミックスダブルス／team … 団体戦（クラブ対抗戦・チーム対抗戦など）
// pos は切り抜くときに残す位置（CSS の object-position）。人が写っているところに合わせる。
// 写真が無い種目のカードは、写真の場所を薄いグレーにして種目名だけを出す（写真が届いたらここに足す）。
import { eventIcons } from './event-icons.js';

export const EVENT_PHOTOS = {
  s: { src: 'assets/img/event-photos/s.webp', w: 960, h: 640, pos: '58% 45%', alt: 'シングルスでフォアハンドを打つ選手' },
  s: { src: 'assets/img/event-photos/s.webp', w: 960, h: 640, pos: '58% 45%', alt: 'シングルスでフォアハンドを打つ選手' },
  x: { src: 'assets/img/event-photos/x.webp', w: 960, h: 640, pos: '50% 62%', alt: 'ネット越しにラケットを掲げる男女のペア' },
  team: { src: 'assets/img/event-photos/team.webp', w: 960, h: 640, pos: '55% 45%', alt: 'クラブ対抗戦の試合後、コートで礼をする選手たち' },
  d: { src: 'assets/img/event-photos/d.webp', w: 960, h: 640, pos: '45% 45%', alt: 'ダブルスでフォアハンドを打つ選手' },
};

/** 大会ごとの写真（大会名で見分ける）。種目の写真より優先する */
const BY_NAME = [
  { match: /エネトピア/, photo: { src: 'assets/img/event-photos/enetopia.webp', w: 960, h: 655, pos: '50% 12%', alt: 'enetopia の旗を広げる2人の選手' } },
  { match: /プリンスオープン/, photo: { src: 'assets/img/event-photos/prince-open.webp', w: 729, h: 370, pos: '50% 60%', alt: 'プリンスオープンの参加者の集合写真' } },
];

/**
 * 大会名・種目の文言 → カードに出す写真（無ければ null）と、写真が無いときに出す種目名。
 * 大会ごとの写真（BY_NAME）があればそれを、無ければ種目の写真を使う。種目が複数あるときは、写真のある最初の種目。
 */
export function eventPhoto(text, name = '') {
  const icons = eventIcons(text);
  const own = BY_NAME.find((x) => x.match.test(String(name ?? '')));
  if (own) return { photo: own.photo, label: icons[0]?.label ?? '' };
  const hit = icons.find((ic) => EVENT_PHOTOS[ic.key]);
  return { photo: hit ? EVENT_PHOTOS[hit.key] : null, label: icons[0]?.label ?? '' };
}
