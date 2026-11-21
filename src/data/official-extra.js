// 公式サイト（https://www.tottori-tenis.net/）に先に載った内容を、管理画面（EmDash）に入るまでのあいだ補うもの。
// 管理画面に同じ素材・状態・お知らせが入ったら、ここから消すこと（素材は二重に並ぶため）。
//
//   EXTRA_MATERIALS … 大会ごとに足す素材（種類 → { images, pdfs }）。移行前の素材のあと、管理画面の素材の前に並ぶ（events.js）
//   STATE_OVERRIDE  … 管理画面の受付状態がまだ「まもなく受付／未受付」のときだけ、こちらの状態にする（schedule.js）
//   STATE_FORCE     … 管理画面の受付状態にかかわらず、こちらの状態にする（開催日の「開催中・速報」を早めに終えるときなど。schedule.js）
//   EXTRA_CARDS     … 管理画面で「トップページの大会カードに出す」にチェックが無くても、トップの大会カードに出す大会（tournaments.js）
//   EXTRA_TOURNAMENTS … 管理画面にまだ無い大会の行（管理画面の「大会」と同じ項目。cms.js が読み込んだ行に足す。同じ slug が管理画面にあればそちらを使う）
//   EXTRA_WINNERS   … 大会ごとの成績（管理画面の「成績」と同じ形 { category, award, name }。管理画面に成績があればそちらを使う。events.js）
//   EXTRA_REVISIONS … 大会ごとの訂正の記録（管理画面の「訂正の記録」と同じ形。events.js が管理画面の行に足す）
//   EXTRA_NEWS      … お知らせに足す行（news.js。同じ日付・同じ題名の行が管理画面にあれば足さない）。
//                     同じ日付の中で先頭に出したいときは createdAt（'2026-11-02T19:15:00+09:00' の形）に掲載した時刻を書く

const img = (slug, file, label) => ({ src: `assets/img/events/${slug}/${file}`, label, w: 1241, h: 1754 });

export const EXTRA_MATERIALS = {
  // 2026 プリンスオープン チーム対抗戦（11/22）：ドローの訂正版（2026.11.18）。注意事項⑨⑩の訂正と、選手名簿への追加・変更
  //   （B はっぴ～♪ばうわ 橋本 恵子・C カペリス 前田 良枝・E 湖山池TC 中浜 拓真・F プラセール レト 奥山 恵介）。
  //   管理画面の 1・2 ページ目（プログラム・予選リーグ）と PDF が古いので、replace で管理画面のドローを出さず、ここの 4 枚と PDF だけを出す
  //   （3・4 ページ目のオーダー・オブ・プレーと順位別決勝トーナメントは変わっていないので、管理画面の画像を写して置いた）。
  //   管理画面のドローを訂正版に差し替えたら、この行は消す
  'r8-prince-open': {
    draw: {
      replace: true,
      images: [
        { src: 'assets/img/events/r8-prince-open/draw-01-v2.webp', label: 'プログラム・注意事項（訂正版）', w: 1272, h: 1800 },
        { src: 'assets/img/events/r8-prince-open/draw-02-v2.webp', label: '予選リーグ（訂正版）', w: 1272, h: 1800 },
        { src: 'assets/img/events/r8-prince-open/draw-03.webp', label: 'オーダー・オブ・プレー', w: 1272, h: 1800 },
        { src: 'assets/img/events/r8-prince-open/draw-04.webp', label: '順位別決勝トーナメント', w: 1272, h: 1800 },
      ],
      pdfs: [{ src: 'assets/pdf/events/r8-prince-open/R8プリンスオープンチーム対抗戦ドロー（訂正版）.pdf', label: 'R8プリンスオープンチーム対抗戦ドロー（訂正版）', kb: 945 }],
    },
  },
  // 第41回鳥取市市長杯テニス大会（シングルス。11/23）：ドロー（プログラム。2026.11.13 掲載。
  //   男子A級Cリーグ⑬の選手の所属を、届いた版の「doMe」から「フリー」に直して載せた。2ページ目の画像と PDF。
  //   11.21 男子A級Bリーグ⑥ 伊藤 啓介さんが欠場、Cリーグ⑬の細川 善貴さんが⑥へ移動（2ページ目の画像と PDF を訂正）
  'r8-shicho': {
    draw: {
      images: [
        img('r8-shicho', 'draw-01.webp', 'プログラム（日程・注意事項）'),
        img('r8-shicho', 'draw-02-v2.webp', '男子A級・男子B級シングルス（訂正）'),
        img('r8-shicho', 'draw-03.webp', '男子C級・女子B級・女子C級シングルス'),
      ],
      pdfs: [{ src: 'assets/pdf/events/r8-shicho/R8市長杯ドロー（訂正版）.pdf', label: 'R8市長杯 ドロー（プログラム・訂正版）', kb: 332 }],
    },
  },
  // 第62回鳥取市テニス協会会長杯（秋季・ダブルス。11/15）：ドロー（プログラム。2026.11.2 掲載、11.3 訂正版に差し替え：
  //   男子C級の決勝リーグの組み合わせ、試合方式を「6ゲームマッチ・ノーアド（6-6タイブレーク）」に。2ページ目の画像と PDF。
  //   11.5 お問い合わせを受けて、男子B級Cリーグの選手名の誤りを訂正）
  'r8-kaicho-autumn': {
    // 男子C級ダブルスは、難波・米村 対 山本・入江 のスコアが逆に入っていた（正しくは 6-3 で難波・米村の勝ち）。
    // 2026.11.15 に直した結果で作り直し（result-10-v2）
    // 結果（2026.11.15。大会運営システムの結果画像。16:49 の全試合終了後の結果で作り直した）
    result: {
      images: [
        { src: 'assets/img/events/r8-kaicho-autumn/result-01-v3.webp', label: '男子B級ダブルス Aリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-02-v3.webp', label: '男子B級ダブルス Bリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-03-v3.webp', label: '男子B級ダブルス Cリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-04-v3.webp', label: '男子B級ダブルス Dリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-05-v3.webp', label: '男子B級ダブルス Eリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-06-v3.webp', label: '男子B級ダブルス Fリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-07-v3.webp', label: '男子B級ダブルス Gリーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-08-v3.webp', label: '男子B級ダブルス 1位・2位トーナメント', w: 1760, h: 1132 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-09-v3.webp', label: '男子B級ダブルス 3位・4位トーナメント', w: 1782, h: 1136 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-10-v2.webp', label: '男子C級ダブルス 決勝リーグ', w: 1760, h: 872 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-11-v3.webp', label: '女子B級ダブルス Aリーグ', w: 1760, h: 760 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-12-v3.webp', label: '女子B級ダブルス Bリーグ', w: 1760, h: 760 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-13-v2.webp', label: '女子B級ダブルス 1位トーナメント', w: 1760, h: 738 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-14-v2.webp', label: '女子B級ダブルス 2位トーナメント', w: 1760, h: 738 },
        { src: 'assets/img/events/r8-kaicho-autumn/result-15-v2.webp', label: '女子B級ダブルス 3位トーナメント', w: 1760, h: 738 },
      ],
      pdfs: [],
    },
    // 入賞者の写真（表彰式。明るさとシネマ風の色に整えたもの）。ラベルの先頭の種目名で結果の欄の種目に入り、
    // after（結果表のファイル名）の表のすぐ下に置く（EventResult.astro）
    photo: {
      images: [
        { src: 'assets/img/events/r8-kaicho-autumn/photo-01.webp', label: '男子B級ダブルス 1位・2位トーナメント 優勝 岸本・安田 ペア', w: 1400, h: 933, after: 'result-08-v3' },
        { src: 'assets/img/events/r8-kaicho-autumn/photo-02.webp', label: '男子B級ダブルス 1位・2位トーナメント 準優勝 北村・山本 ペア', w: 1400, h: 933, after: 'result-08-v3' },
        { src: 'assets/img/events/r8-kaicho-autumn/photo-03.webp', label: '女子B級ダブルス 1位トーナメント 優勝 高木・遠藤 ペア', w: 1400, h: 933, after: 'result-13-v2' },
        { src: 'assets/img/events/r8-kaicho-autumn/photo-04.webp', label: '女子B級ダブルス 1位トーナメント 準優勝 小見山・谷口 ペア', w: 1400, h: 933, after: 'result-13-v2' },
        { src: 'assets/img/events/r8-kaicho-autumn/photo-05.webp', label: '女子B級ダブルス 2位トーナメント 優勝 山本・大田 ペア', w: 1400, h: 933, after: 'result-14-v2' },
        { src: 'assets/img/events/r8-kaicho-autumn/photo-06.webp', label: '男子C級ダブルス 優勝 難波・米村 ペア', w: 1400, h: 933, after: 'result-10-v2' },
        { src: 'assets/img/events/r8-kaicho-autumn/photo-07.webp', label: '男子C級ダブルス 準優勝 中井・吉田 ペア', w: 1400, h: 933, after: 'result-10-v2' },
      ],
      pdfs: [],
    },
    draw: {
      images: [
        img('r8-kaicho-autumn', 'draw-01.webp', 'プログラム（日程・注意事項）'),
        img('r8-kaicho-autumn', 'draw-02.webp', '男子B級・男子C級・女子B級ダブルス'),
      ],
      pdfs: [{ src: 'assets/pdf/events/r8-kaicho-autumn/R8会長杯秋の部ダブルスプログラム（訂正版）.pdf', label: 'R8会長杯 秋の部 ダブルス プログラム（訂正版）', kb: 867 }],
    },
  },
  // 第22回京丹後市オープンミックスダブルステニス大会：要項（京丹後市テニス協会から届いた Word を PDF にしたもの。2026.11.2）
  'r8-kyotango-mixed': {
    outline: {
      images: [img('r8-kyotango-mixed', 'outline-01.webp', '要項')],
      pdfs: [{ src: 'assets/pdf/events/r8-kyotango-mixed/第22回京丹後市オープンミックスダブルス大会_要項.pdf', label: '要項', kb: 59 }],
    },
  },
  // 鳥大オープンテニス大会（12月・シングルス）：要項と申込用紙（1枚の紙に両方。2026.11.2 の訂正版：種目をダブルス→シングルスに訂正）
  'r8-tottori-univ-winter': {
    outline: { images: [img('r8-tottori-univ-winter', 'outline-01.webp', '要項・申込用紙')], pdfs: [] },
    entry: { images: [], pdfs: [{ src: 'assets/pdf/events/r8-tottori-univ-winter/R8鳥大オープンテニス大会_要項.pdf', label: '要項・申込用紙', kb: 222 }] },
  },
  // 鳥取県テニス選手権 シングルス：ドロー（2026.10.30。選手の所属を訂正した版）
  'r8-kensen-singles': {
    draw: {
      images: [
        img('r8-kensen-singles', 'draw-01.webp', 'プログラム'),
        img('r8-kensen-singles', 'draw-02.webp', '一般男子シングルス'),
        img('r8-kensen-singles', 'draw-03.webp', '男子45歳以上・65歳以上／一般女子・女子45歳以上シングルス（訂正）'),
      ],
      pdfs: [],
    },
  },
  // 鳥取県テニス選手権 ダブルス：要項と申込用紙（2026.10.26。11/13 締切）
  'r8-no18': {
    outline: { images: [img('r8-no18', 'outline-01.webp', '要綱')], pdfs: [] },
    // ドロー（2026.11.18 掲載。12面。表紙・注意事項／一般男子・男子45歳以上／男子65歳以上・一般女子・女子45歳以上）。
    //   11.19 お問い合わせを受けて、男子65歳以上ダブルス④ 梶 松寿さんの所属を「フリー」→「アスペック」に訂正（3ページ目の画像と PDF）
    draw: {
      images: [
        img('r8-no18', 'draw-01.webp', '表紙・注意事項'),
        img('r8-no18', 'draw-02.webp', '一般男子・男子45歳以上ダブルス'),
        img('r8-no18', 'draw-03-v2.webp', '男子65歳以上・一般女子・女子45歳以上ダブルス（訂正）'),
      ],
      pdfs: [{ src: 'assets/pdf/events/r8-no18/R8県選ダブルスドロー（訂正版）.pdf', label: 'R8県選ダブルス ドロー（訂正版）', kb: 128 }],
    },
    entry: { images: [], pdfs: [{ src: 'assets/pdf/events/r8-no18/令和8年県選ダブルス申込用紙.pdf', label: '申込用紙', kb: 104 }] },
  },
};

// 結果の欄の上に出すお知らせ（notice）と、結果の欄の下に観戦ページへの案内を出すか（live）。EventResult.astro
// hidden: true … 結果（結果表・入賞者の写真・成績）を一旦すべて出さず、お知らせと観戦ページの案内だけにする（events.js）。
//               結果の画像・データは消さずに残しているので、hidden を外せば元の結果に戻る
export const EXTRA_RESULT_NOTES = {
  // 'r8-kaicho-autumn'：2026.11.15 夕方に結果全体を一旦非公開（hidden）にし、男子C級のスコアの誤りと順位（取得ゲーム率）を
  //   直して再び公開。お知らせ・観戦ページの案内はどちらも外した
};

// ドローのページの上に出すお知らせ（draw-<slug>.html。id はページ内の位置 #id に使う。お知らせのリンク先に #id を付ける）
export const EXTRA_DRAW_NOTICES = {
  // 2026 プリンスオープン（11/22）：当日の動画撮影（SNS・ホームページ用）。大会運営委員の了承を得て 2026.11.19 に告知
  'r8-prince-open': [
    {
      id: 'filming',
      head: '当日の動画撮影について',
      lines: [
        '当日は、SNS（Instagram など）やホームページで大会の様子をお伝えするため、会場で動画を撮影します。撮影することは、当日も会場の放送でお知らせします。',
        '映りたくない方は、事前にお問い合わせフォームからご連絡いただくか、当日、大会本部または撮影担当にお声がけください。',
      ],
      link: { href: 'contact.html', label: 'お問い合わせフォーム' },
    },
  ],
};

export const EXTRA_WINNERS = {
  // 第62回会長杯（秋季）：表彰状のとおり（男子B級は 1位・2位トーナメントの結果）。女子B級は 1位・2位・3位トーナメントごと
  'r8-kaicho-autumn': [
    // 男子B級も 1位・2位／3位・4位トーナメントごとに出す
    { category: '男子B級ダブルス 1位・2位トーナメント', award: '優勝', name: '岸本・安田 ペア' },
    { category: '男子B級ダブルス 1位・2位トーナメント', award: '準優勝', name: '北村・山本 ペア' },
    { category: '男子B級ダブルス 3位・4位トーナメント', award: '優勝', name: '遠藤・吉識 ペア' },
    { category: '男子B級ダブルス 3位・4位トーナメント', award: '準優勝', name: '谷口・近藤 ペア' },
    { category: '男子C級ダブルス', award: '優勝', name: '難波・米村 ペア' },
    { category: '男子C級ダブルス', award: '準優勝', name: '中井・吉田 ペア' },
    // 女子B級は 1位・2位・3位トーナメント（A1 対 B1 など）ごとに出す
    { category: '女子B級ダブルス 1位トーナメント', award: '優勝', name: '高木・遠藤 ペア' },
    { category: '女子B級ダブルス 1位トーナメント', award: '準優勝', name: '小見山・谷口 ペア' },
    { category: '女子B級ダブルス 2位トーナメント', award: '優勝', name: '山本・大田 ペア' },
    { category: '女子B級ダブルス 2位トーナメント', award: '準優勝', name: '田苗・鳥飼 ペア' },
    { category: '女子B級ダブルス 3位トーナメント', award: '優勝', name: '米谷・藤田 ペア' },
    { category: '女子B級ダブルス 3位トーナメント', award: '準優勝', name: '山根・田中 ペア' },
  ],
};

export const EXTRA_TOURNAMENTS = [
  // 第22回京丹後市オープンミックスダブルステニス大会（12/6。京丹後市テニス協会の主催。申込は同協会のエントリーフォーム）
  {
    slug: 'r8-kyotango-mixed',
    name: '第22回京丹後市オープンミックスダブルステニス大会', nendo: '2026', no: '', kind: '預かり',
    event: 'ミックスダブルス（一般クラス／100歳クラス）', date: '2026-12-06', label: '12月6日（日）',
    place: '峰山総合公園テニスコート（京都府京丹後市）',
    spare_date: '', spare_venue: '', spare_note: '予備日なし',
    due: '11/27（金）20:00', state: '受付中', reg: '登録不要',
    host: '京丹後市テニス協会',
    note: '京丹後市テニス協会が主催するオープン大会です（ミックスダブルス。一般クラスと、ペアの年齢の合計が100歳以上の100歳クラス。各クラス4組以上で成立）。参加料は1ペア3,300円（保険料込み・当日会場で支払い。高校生以下は半額）。申込は京丹後市テニス協会のホームページにあるエントリーフォームから行ってください（100歳クラスは生年月日を必ず記入。本人以外の申込はできません）。ドローも同ホームページに掲載されます。',
    link_label: '京丹後市テニス協会のホームページで申し込む', link_url: 'https://kyotangotennis.sakura.ne.jp/',
    card: true, materials: [], winners: [], legacy_materials: {},
  },
  // 鳥大オープンテニス大会（12月・シングルス）。要項・申込用紙は 2026.11.2 の訂正版（申込期限 11/27）
  {
    slug: 'r8-tottori-univ-winter',
    name: '鳥大オープンテニス大会', nendo: '2026', no: '', kind: '預かり',
    event: '男女シングルス', date: '2026-12-06', label: '12月6日（日）',
    place: '鳥取大学テニスコート',
    spare_date: '', spare_venue: '', spare_note: '',
    due: '11/27', state: '受付中', reg: '登録不要',
    host: '鳥取大学硬式庭球部',
    note: '鳥取大学硬式庭球部が主催する大会です（男子シングルス・女子シングルス。1セットマッチ・セルフジャッジ、決勝のみ8ゲームズプロセット）。参加費は1人1,500円で、当日の受付で集めます。申込用紙は鳥取大学硬式庭球部の部室か、テニスショップ フラシーノへ届けてください（11/27 まで）。雨で中止のときは30分前までに連絡があります。協会は要項・ドロー・結果の掲載に協力しています。',
    link_label: '', link_url: '',
    card: true, materials: [], winners: [], legacy_materials: {},
  },
];

export const EXTRA_REVISIONS = {
  'r8-shicho': [
    { date: '2026-11-21', section: 'ドロー', text: '男子A級シングルス Bリーグ⑥の伊藤 啓介さんが欠場のため、Cリーグ⑬の細川 善貴さんがBリーグ⑥に入ります。ドローは訂正版に差し替えています（当日のプログラムは印刷済みのため訂正前のままです）。' },
  ],
  'r8-no18': [
    { date: '2026-11-19', section: 'ドロー', text: '男子65歳以上ダブルス④ 梶 松寿さんの所属を「フリー」から「アスペック」に訂正しました。ドローは訂正版に差し替えています。' },
  ],
  'r8-prince-open': [
    { date: '2026-11-18', section: 'ドロー', text: '注意事項⑨を「各順位別トーナメント優勝・準優勝チームに賞品を進呈」、⑩を「各順位別トーナメント1・2回戦敗退チームに抽選でプレゼントを進呈」に訂正しました。あわせて選手名簿に追加・変更がありました（Bリーグ はっぴ～♪ばうわ、Cリーグ カペリス、Eリーグ 湖山池TC、Fリーグ プラセール レト）。ドローは訂正版に差し替えています。' },
  ],
  'r8-kaicho-autumn': [
    { date: '2026-11-05', section: 'ドロー', text: '男子B級ダブルス Cリーグの選手名の誤りを訂正しました。' },
    { date: '2026-11-03', section: 'ドロー', text: '男子C級ダブルスの決勝リーグの組み合わせを差し替え、試合方式を「6ゲームマッチ・ノーアド（6-6タイブレーク）」に訂正しました（注意事項の記載のとおりです）。' },
  ],
  'r8-tottori-univ-winter': [
    { date: '2026-11-02', section: '要項', text: '種目を「男子ダブルス・女子ダブルス」から「男子シングルス・女子シングルス」に訂正しました。要項・申込用紙は訂正版に差し替えています。' },
  ],
  'r8-kensen-singles': [
    { date: '2026-10-30', section: 'ドロー', text: '男子45歳以上・65歳以上／一般女子・女子45歳以上シングルスのドローで、選手の所属を訂正しました。' },
  ],
};

export const STATE_FORCE = {
  'r8-kaicho-autumn': '終了', // 第62回会長杯（秋季）：11/15 の速報を終えて結果を掲載
};

export const STATE_OVERRIDE = {
  'r8-no18': '受付中',
};

export const EXTRA_CARDS = [
  'r8-no18', // 鳥取県テニス選手権 ダブルス（受付中。11/13 締切）
  'r8-tottori-univ-winter', // 鳥大オープンテニス大会（12/6。受付中。11/27 締切）
  'r8-kyotango-mixed', // 京丹後市オープンミックスダブルス（12/6。受付中。11/27 締切）
];

export const EXTRA_NEWS = [
  { slug: 'official-20261121-shicho-draw-fix', date: '2026-11-21', createdAt: '2026-11-21T10:00:00+09:00', category: '大会', title: '第41回鳥取市市長杯テニス大会（11/23）のドローを訂正しました（男子A級シングルスの選手の変更）', href: 'draw-r8-shicho.html' },
  { slug: 'official-20261119-kensen-d-draw-fix', date: '2026-11-19', createdAt: '2026-11-19T08:00:00+09:00', category: '大会', title: '鳥取県テニス選手権ダブルス（11/29）のドローを訂正しました（男子65歳以上ダブルスの選手の所属）', href: 'draw-r8-no18.html' },
  { slug: 'official-20261119-prince-filming', date: '2026-11-19', createdAt: '2026-11-19T07:00:00+09:00', category: '大会', title: '2026 プリンスオープン チーム対抗戦（11/22）当日の動画撮影についてのお知らせ', href: 'draw-r8-prince-open.html#filming' },
  { slug: 'official-20261118-kensen-d-draw', date: '2026-11-18', createdAt: '2026-11-18T14:40:00+09:00', category: '大会', title: '鳥取県テニス選手権ダブルス（11/29）のドローを掲載しました', href: 'draw-r8-no18.html' },
  { slug: 'official-20261118-prince-draw-fix', date: '2026-11-18', createdAt: '2026-11-18T14:30:00+09:00', category: '大会', title: '2026 プリンスオープン チーム対抗戦（11/22）のドローを訂正しました（注意事項⑨⑩・選手名簿の追加）', href: 'draw-r8-prince-open.html' },
  { slug: 'official-20261115-kaicho-autumn-result', date: '2026-11-15', createdAt: '2026-11-15T16:45:00+09:00', category: '結果', title: '第62回鳥取市テニス協会会長杯（秋季）の結果を掲載しました', href: 'result-r8-kaicho-autumn.html' },
  { slug: 'official-20261113-shicho-draw', date: '2026-11-13', createdAt: '2026-11-13T07:55:00+09:00', category: '大会', title: '第41回鳥取市市長杯テニス大会（11/23）のドローを掲載しました', href: 'draw-r8-shicho.html' },
  { slug: 'official-20261105-kaicho-autumn-draw-name-fix', date: '2026-11-05', createdAt: '2026-11-05T14:45:00+09:00', category: '大会', title: '第62回鳥取市テニス協会会長杯（秋季・11/15）のドローを訂正しました（男子B級Cリーグの選手名）', href: 'draw-r8-kaicho-autumn.html' },
  { slug: 'official-20261103-kaicho-autumn-draw-fix', date: '2026-11-03', createdAt: '2026-11-03T11:30:00+09:00', category: '大会', title: '第62回鳥取市テニス協会会長杯（秋季・11/15）のドローを訂正しました（男子C級の組み合わせ・試合方式は6ゲームマッチ）', href: 'draw-r8-kaicho-autumn.html' },
  { slug: 'official-20261102-kaicho-autumn-draw', date: '2026-11-02', createdAt: '2026-11-02T19:15:00+09:00', category: '大会', title: '第62回鳥取市テニス協会会長杯（秋季・11/15）のドローを掲載しました', href: 'draw-r8-kaicho-autumn.html' },
  { slug: 'official-20261102-kyotango-mixed-outline', date: '2026-11-02', category: '大会', title: '京丹後市オープンミックスダブルス大会（12/6）の要項を掲載しました（11/27締切）', href: 'outline-r8-kyotango-mixed.html' },
  { slug: 'official-20261102-tottori-univ-outline-fix', date: '2026-11-02', category: '大会', title: '鳥大オープンテニス大会（12/6）の要項を訂正しました（種目はダブルスではなくシングルスです）', href: 'outline-r8-tottori-univ-winter.html' },
  { slug: 'official-20261101-tottori-univ-outline', date: '2026-11-01', category: '大会', title: '鳥大オープンテニス大会（12/6）の要項・申込用紙を掲載しました（11/27締切）', href: 'outline-r8-tottori-univ-winter.html' },
  { slug: 'official-20261030-kensen-s-draw', date: '2026-10-30', category: '大会', title: '鳥取県テニス選手権シングルスのドローを掲載しました（選手の所属を訂正）', href: 'draw-r8-kensen-singles.html' },
  { slug: 'official-20261026-kensen-d-outline', date: '2026-10-26', category: '大会', title: '鳥取県テニス選手権ダブルスの要項・申込用紙を掲載しました（11/13締切）', href: 'outline-r8-no18.html' },
];
