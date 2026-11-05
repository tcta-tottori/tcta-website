// Excel（ドロー表・大会日程表）を、大会運営のデータベースの形（worker/catalog.ts）に直す。
// 運営画面の「Excel から入れる」と、Claude Code が使う scripts/catalog.mts の両方がこれを使う（同じ結果になる）。
import type { ParsedDrawFile } from '../data/drawExcelParser';
import type { OfficialTournament } from '../data/tournamentListParser';
import type { CatalogTournament, CatalogTournamentFull } from './catalogApi';

const z2h = (s: string) => s.replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));

/** 表記をそろえる（全角の英数字・空白を半角に、空白は 1 つに） */
export const tidy = (s: string) =>
  (s ?? '').replace(/[Ａ-Ｚａ-ｚ０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[\s\u3000]+/g, ' ').trim();

/** 「令和8年度」→ 2026（年度の始まりの年） */
export function fiscalYearOf(text: string): number | null {
  const m = z2h(text ?? '').match(/令和\s*(\d+)\s*年/);
  return m ? 2018 + Number(m[1]) : null;
}

/** 「11/8（日）」と年度 → 2026-11-08。協会の年度は 3 月に始まる（令和8年度 = 2026/3〜2027/2）ので、1・2 月は翌年 */
export function isoDate(md: string, fy: number | null): string {
  const m = z2h(md ?? '').match(/(\d{1,2})\s*[/月]\s*(\d{1,2})/);
  if (!m || !fy) return '';
  const mo = Number(m[1]);
  const y = mo <= 2 ? fy + 1 : fy;
  return `${y}-${String(mo).padStart(2, '0')}-${String(Number(m[2])).padStart(2, '0')}`;
}

/** 年度が書かれていないときは、その月日がいちばん近く来る年度にする */
export function guessFiscalYear(md: string, now = new Date()): number {
  const fy = now.getMonth() + 1 <= 2 ? now.getFullYear() - 1 : now.getFullYear();
  const cand = [fy - 1, fy, fy + 1].map((y) => ({ y, d: isoDate(md, y) })).filter((c) => c.d);
  if (cand.length === 0) return fy;
  cand.sort((a, b) => Math.abs(new Date(a.d).getTime() - now.getTime()) - Math.abs(new Date(b.d).getTime() - now.getTime()));
  return cand[0].y;
}

/** 大会名（と種目）から id の後ろ半分。協会サイトの大会ページと同じ名前（event-r8-kensen-singles など） */
const SLUGS: [RegExp, string][] = [
  [/東部地区.*ダブルス/, 'tobu-doubles'],
  [/東部地区/, 'tobu-singles'],
  [/佐々木杯/, 'sasaki'],
  [/会長杯.*春/, 'kaicho-spring'],
  [/会長杯.*秋/, 'kaicho-autumn'],
  [/健康テニス.*春/, 'kenko-spring'],
  [/健康テニス.*秋/, 'kenko-autumn'],
  [/クラブ対抗.*前期/, 'club-first'],
  [/クラブ対抗.*後期/, 'club-second'],
  [/市民体育祭/, 'taiikusai'],
  [/気高カップ/, 'ketaka-cup'],
  [/サマーミックス/, 'summer-mixed'],
  [/ダンロップ/, 'dunlop'],
  [/エネトピア/, 'enetopia'],
  [/県テニス選手権.*シングルス/, 'kensen-singles'],
  [/県テニス選手権.*ダブルス/, 'kensen-doubles'],
  [/プリンス/, 'prince-open'],
  [/市長杯/, 'shicho'],
  [/尾坂杯|室内/, 'osaka-indoor'],
  [/テニス祭り/, 'matsuri'],
];

export function slugOf(text: string, fy: number | null, no = ''): string {
  const r = fy ? `r${fy - 2018}` : 'x';
  const hit = SLUGS.find(([re]) => re.test((text ?? '').replace(/\s+/g, '')));
  if (hit) return `${r}-${hit[1]}`;
  if (no) return `${r}-no${z2h(no).padStart(2, '0')}`;
  return `${r}-t${Date.now().toString(36)}`;
}

/** 大会日程表の 1 行 → 日程だけの大会 */
export function seasonEntry(t: OfficialTournament, sourceName: string) {
  const fy = fiscalYearOf(t.season);
  const date = isoDate(t.date, fy);
  return {
    // 東部地区はシングルスとダブルスが同じ名前なので、種目も合わせて見る
    id: slugOf(`${t.name} ${t.category}`, fy, t.no),
    body: {
      name: tidy(t.name), date, venue: tidy(t.venue), reserveDate: isoDate(t.reserveDate, fy), reserveVenue: tidy(t.reserveVenue),
      category: tidy(t.category), status: 'planned' as const, source: `大会日程（${sourceName}）`, note: date ? '' : `期日: ${t.date}`,
      settings: {}, draw: null,
    },
  };
}

type Body = Omit<CatalogTournamentFull, 'id' | 'events' | 'players' | 'updatedAt' | 'updatedBy'>;

/**
 * 読み取ったドロー表 → 運営できる大会。
 * 日程だけで入っている大会のうち同じ日のもの（同じ日が複数なら名前の近いもの）に重ね、大会名・会場は大会日程の正式なものを使う。
 */
export function drawEntry(
  parsed: ParsedDrawFile,
  existing: CatalogTournament[],
  opt: { id?: string; name?: string; courts?: number; sourceName?: string } = {},
): { id: string; body: Body; matched: CatalogTournament | undefined } {
  const fy = fiscalYearOf(parsed.tournamentName) ?? fiscalYearOf(parsed.fileName) ?? guessFiscalYear(parsed.date);
  const date = isoDate(parsed.date, fy);
  const sameDay = existing.filter((t) => t.date === date);
  const slug = slugOf(parsed.tournamentName, fy);
  const matched = opt.id
    ? existing.find((t) => t.id === opt.id)
    : sameDay.length === 1 ? sameDay[0] : sameDay.find((t) => t.id === slug) ?? existing.find((t) => t.id === slug);
  const id = opt.id ?? matched?.id ?? slug;
  const courts = opt.courts && opt.courts > 0 ? opt.courts : 16;
  return {
    id,
    matched,
    body: {
      name: tidy(opt.name ?? matched?.name ?? parsed.tournamentName),
      date: date || matched?.date || '',
      venue: matched?.venue || tidy(parsed.venue),
      reserveDate: matched?.reserveDate || isoDate(parsed.reserveDate, fy),
      reserveVenue: matched?.reserveVenue || tidy(parsed.reserveVenue),
      category: matched?.category ?? '',
      status: 'ready',
      source: `ドロー（${opt.sourceName ?? parsed.fileName}）`,
      note: matched?.note ?? '',
      settings: { courtNames: Array.from({ length: courts }, (_, i) => String(i + 1)), startTime: parsed.earliestStartTime || '09:00' },
      draw: {
        earliestStartTime: parsed.earliestStartTime || undefined,
        suggestedCourtCount: parsed.suggestedCourtCount || undefined,
        events: parsed.events.map((e) => ({
          eventName: e.eventName, type: e.type, drawSize: e.drawSize, isRoundRobin: e.isRoundRobin, matchFormat: e.matchFormat,
          players: e.players.filter((p) => !p.isBye).map((p) => ({
            position: p.position, name: p.name, affiliation: p.affiliation, ...(p.seed ? { seed: p.seed } : {}),
            ...(p.partnerName ? { partnerName: p.partnerName, partnerAffiliation: p.partnerAffiliation ?? '' } : {}),
          })),
          roundGameRules: e.roundGameRules,
          matchTimes: e.matchTimes as unknown as Record<string, string>,
          roundMatchTimes: e.roundMatchTimes,
          ...(e.eventStartTime ? { eventStartTime: e.eventStartTime } : {}),
        })),
      },
    },
  };
}
