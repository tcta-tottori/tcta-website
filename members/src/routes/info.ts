// 案内のページ: セキュリティと個人情報の取扱い（/security）、会員情報共同利用規程・プライバシーポリシー（案）（/privacy）。
// 内容は導入設計書 第 7 章（セキュリティ設計）・第 8 章（協会間ガバナンス）に基づく。規程は役員会で確定するまで「案」。
import { Hono } from 'hono';
import { html } from 'hono/html';
import type { Vars } from '../app';
import { type Env, isDemo, isProd } from '../env';
import { accessEnabled } from '../lib/access';
import { all } from '../lib/db';
import type { Association } from '../types';
import { page } from '../views/layout';

export const info = new Hono<{ Bindings: Env; Variables: Vars }>();

const ROLES: [string, string, string, string, string, string][] = [
  ['協会管理（各協会の事務局）', '閲覧・編集', '閲覧・編集', '可', '可（目的を記録）', '自協会の登録者のみ'],
  ['大会運営', '閲覧', '不可', '担当大会のみ', 'エントリー一覧のみ', '不可'],
  ['閲覧', '閲覧', '不可', '不可', '不可', '不可'],
  ['ショップ（代行入力）', '入力のみ', '不可', '現金受領の記録のみ', '不可', '不可'],
  ['クラブ連絡担当', '自クラブのみ', '不可', '不可', '不可', '不可'],
  ['システム管理者', '不可（設定専用）', '不可', '不可', '不可', '不可'],
];

const THREATS: [string, string][] = [
  ['ボットによる大量登録・スパム', '公開フォームに Turnstile（ボット判定）を置き、同じ場所からの登録は 1 時間に 5 回、ログインリンクは 15 分に 3 回までに制限します。'],
  ['なりすましのエントリー（他人名義の申込）', 'ペアは会員番号か本人確認済みの会員の検索から選びます。指定されたペアにも通知を送り、異議があれば事務局が取り消します。'],
  ['管理者アカウントの乗っ取り', '事務局画面は Cloudflare Access の手前で遮断し、Google 側の 2 段階認証を協会ルールで義務づけます。退任時は即日削除し、年 1 回棚卸しします。'],
  ['決済通知（Stripe Webhook）の偽装', '署名を検証し、金額・通貨・支払 ID を突き合わせてから入金を確定します。合わないものは拒否して記録します。'],
  ['不正な入力（インジェクション・XSS）', 'データベースへの問い合わせはすべてプリペアドステートメント。画面の出力は自動でエスケープし、CSP でインラインスクリプトを禁止しています。'],
  ['推測しやすい ID', '会員 ID・エントリー ID は推測できない ULID で、URL に連番を出しません。'],
  ['依存パッケージの脆弱性', 'GitHub Dependabot を有効にし、月次の更新を確認します。'],
  ['画面の偽装（クリックジャッキング）', '他サイトへの埋め込みを禁止（frame-ancestors none）し、フォームの送信先を自サイトに限定しています。'],
];

info.get('/security', async (c) => {
  const env = c.env;
  const assocs = await all<Association>(env.DB, "SELECT * FROM associations ORDER BY (id LIKE '%pref%') DESC, name");
  const prod = isProd(env);
  const body = html`
    <div class="card">
      <p><b>方針: 閲覧できる人を最小にし、誰がいつ見たかを残す。</b></p>
      <p>このシステムは${assocs.length ? assocs.map((a) => a.name).join('・') : 'テニス協会'}が共同で利用し、会員約 1,000 名分の氏名・連絡先と支払記録をお預かりします。協会は個人情報保護法上の個人情報取扱事業者にあたるため、組織的・人的・物理的・技術的な安全管理措置を「人の注意」ではなく「仕組み」で満たすように作っています。</p>
      <div class="steps">
        <div class="step"><p class="step__title">最小保有</p><p class="step__text">必要な項目だけを預かり、退会後 2 年で連絡先を削除します。</p></div>
        <div class="step"><p class="step__title">最小権限</p><p class="step__text">住所・電話・メールを見られるのは登録先の協会の事務局だけです。</p></div>
        <div class="step"><p class="step__title">記録</p><p class="step__text">閲覧・出力・更新をすべて記録し、管理者本人も消せません。</p></div>
      </div>
    </div>

    <h2 id="data">お預かりする情報</h2>
    <div class="tbl"><table>
      <tr><th>区分</th><th>項目</th><th>目的</th><th>保存のしかた</th></tr>
      <tr><td>本人の情報</td><td class="wrap-text">姓・名、せい・めい、性別、生年（年のみ）、所属</td><td class="wrap-text">会員の識別、年齢区分の判定、ドロー作成</td><td class="wrap-text">通常の列。生年月日ではなく生年だけを持ちます</td></tr>
      <tr><td>連絡先</td><td class="wrap-text">メール、電話、郵便番号、住所</td><td class="wrap-text">ログインリンクと通知、事務局からの連絡</td><td class="wrap-text">AES-256-GCM で列ごとに暗号化。鍵はプログラムの外（Workers Secrets）に置き、データベースの複製が漏れても読めません</td></tr>
      <tr><td>登録・エントリー</td><td class="wrap-text">年度登録、大会エントリー、ペア、支払の記録（金額・方法・確認者・領収書番号）</td><td class="wrap-text">参加資格の判定、入金確認、会計</td><td class="wrap-text">カード番号は預かりません（決済は Stripe の画面で完結し、こちらには結果だけが届きます）</td></tr>
      <tr><td>記録</td><td class="wrap-text">誰が・いつ・何を閲覧／出力／更新したか</td><td class="wrap-text">安全管理の確認、問い合わせへの回答</td><td class="wrap-text">追記のみ。変更・削除はデータベースの仕組みで禁止</td></tr>
    </table></div>

    <h2 id="login">ログインの仕組み</h2>
    <div class="card">
      <ul class="bullet-list">
        <li>会員はパスワードを使いません。メールアドレスに届く<b>リンクを開くだけ</b>でログインします。パスワードの漏えいや使い回しの危険をなくすためです。</li>
        <li>リンクは <b>15 分間だけ有効で、1 回使うと無効</b>になります。リンクそのものは保存せず、ハッシュ（復元できない値）だけを保存します。</li>
        <li>ログイン状態（セッション）は 30 日で切れます。Cookie は HttpOnly・Secure・SameSite で、スクリプトや他サイトから読めません。</li>
        <li>同じ場所からのリンク送信は 15 分に 3 回、会員登録は 1 時間に 5 回までに制限し、公開フォームにはボット判定（Turnstile）を置きます。</li>
        <li>事務局・ショップの画面は Cloudflare Access（Google またはメールのワンタイムコード＋ 2 段階認証）を通らないと届きません。</li>
      </ul>
    </div>

    <h2 id="roles">誰が何を見られるか</h2>
    <p>協会ごとに閲覧範囲を分け、自協会に登録のある会員だけが見えます。住所・電話・メールを見られるのは「協会管理」だけです。</p>
    <div class="tbl"><table>
      <tr><th>ロール</th><th>氏名・所属</th><th>住所・電話・メール</th><th>承認・消込</th><th>名簿の出力</th><th>他協会のデータ</th></tr>
      ${ROLES.map((r) => html`<tr>${r.map((v, i) => html`<td class="${i === 0 ? '' : 'wrap-text'}">${v}</td>`)}</tr>`)}
    </table></div>
    <p class="mute">本人は自分の情報をすべて見られ、訂正できます。ペア検索で他の会員に見えるのは氏名・ふりがな・会員番号・所属だけです。</p>

    <h2 id="api">外部に渡す情報</h2>
    <div class="card">
      <ul class="bullet-list">
        <li><b>大会運営・ドロー・ライブスコアのアプリ</b>に渡すのは氏名・所属・クラスだけです。連絡先の列はその API に存在しません。取得には大会ごとに発行する期限付きの鍵が必要で、取得も記録に残ります。</li>
        <li><b>Stripe</b>（決済）にはメールアドレスと金額を渡します。カード情報は Stripe の画面で入力され、こちらには届きません。</li>
        <li><b>通知メール</b>は Cloudflare から直接送り、外部のメール配信業者を介しません。</li>
        <li>名簿を Excel・USB・メール添付で授受することは禁止し、協会間の共有は管理画面の閲覧権限で行います。</li>
      </ul>
    </div>

    <h2 id="storage">通信と保存</h2>
    <div class="tbl"><table>
      <tr><th>項目</th><th>対策</th></tr>
      <tr><td>通信</td><td class="wrap-text">全経路 HTTPS。HSTS を有効にし、平文の接続は受け付けません。</td></tr>
      <tr><td>保存</td><td class="wrap-text">データベース（Cloudflare D1）は保存時に暗号化されます。加えて連絡先は列ごとに暗号化し、鍵を別に管理します。</td></tr>
      <tr><td>バックアップ</td><td class="wrap-text">7 日分の時点復元に加え、日次で暗号化した複製を 90 日保持。四半期に 1 回、復元できることを確認します。</td></tr>
      <tr><td>保存期間</td><td class="wrap-text">退会後 2 年で住所・電話・メールを自動で削除し、氏名と大会成績の履歴だけを残します。</td></tr>
      <tr><td>委託先</td><td class="wrap-text">Cloudflare（基盤・データベース・メール送信）、Stripe（決済）、Google（事務局の認証）、LINE（任意の通知）。いずれも「取扱いの委託」として規程に明記します。</td></tr>
    </table></div>

    <h2 id="threats">攻撃への備え</h2>
    <div class="tbl"><table>
      <tr><th>想定する脅威</th><th>対策</th></tr>
      ${THREATS.map(([t, m]) => html`<tr><td class="wrap-text">${t}</td><td class="wrap-text">${m}</td></tr>`)}
    </table></div>

    <h2 id="incident">漏えいが疑われるとき</h2>
    <div class="card">
      <div class="steps">
        <div class="step"><p class="step__title">権限を止める</p><p class="step__text">管理者権限を全停止し、鍵とトークンを入れ替えます。</p></div>
        <div class="step"><p class="step__title">範囲を特定する</p><p class="step__text">監査ログとアクセスログから、誰の・どの情報が・いつ触られたかを確かめます。</p></div>
        <div class="step"><p class="step__title">知らせる</p><p class="step__text">影響を受ける本人に通知し、個人情報保護委員会へ報告します（速報はおおむね 3〜5 日以内、確報は 30 日以内）。</p></div>
      </div>
      <p class="mute">手順書は事前に用意し、管理者は年 1 回確認します。</p>
    </div>

    <h2 id="rights">本人の権利と窓口</h2>
    <div class="card">
      <ul class="bullet-list">
        <li>登録内容はマイページでいつでも確認・訂正できます。</li>
        <li>開示・訂正・削除の依頼は、どの協会で受けても共通の窓口に回し、30 日以内に対応します。</li>
        <li>退会はマイページから申請できます。年度登録・エントリーは無効になり、連絡先は 2 年後に削除されます。</li>
        <li>窓口: 各協会の個人情報管理責任者（協会サイトのお問い合わせ、または事務局まで）。</li>
      </ul>
    </div>

    <h2 id="admin">事務局・管理者の方へ</h2>
    <div class="card">
      <ul class="bullet-list">
        <li>住所・電話・メールは業務に必要なときだけ開いてください。閲覧・出力・更新はすべて監査ログに残り、管理者本人も消せません。</li>
        <li>名簿 CSV を出すときは目的を入力します。出力した名簿は作業後に削除し、Excel・USB・メール添付での授受はしないでください。</li>
        <li>本番環境では Cloudflare Access と Google 側の 2 段階認証が必須です。共用端末では作業後に必ずログアウトしてください。</li>
        <li>権限は年 1 回棚卸しし、退任時は即日削除します。管理者は「個人情報取扱規程」「システム管理者運用規程」を年 1 回確認署名します。</li>
        <li>名寄せ（同姓同名の結合）は自動で行わず、事務局が候補を確認して確定します。結合は記録に残り、取り消せます。</li>
      </ul>
    </div>

    ${!prod ? html`<h2 id="demo">この${isDemo(env) ? 'デモ' : '開発'}環境について</h2>
    <div class="card card--gray">
      <p>ここは架空のデータで動く確認用の環境です。上の仕組みのうち、本番の設定が要るものは次のとおり置き換えています。<b>実在の個人情報は入れないでください。</b></p>
      <div class="tbl"><table>
        <tr><th>仕組み</th><th>この環境</th><th>本番</th></tr>
        <tr><td>事務局の認証</td><td class="wrap-text">${accessEnabled(env) ? 'Cloudflare Access' : '管理者を選ぶだけでログイン'}</td><td class="wrap-text">Cloudflare Access ＋ 2 段階認証</td></tr>
        <tr><td>通知メール</td><td class="wrap-text">送らずに画面と送信箱に表示</td><td class="wrap-text">Cloudflare から送信</td></tr>
        <tr><td>決済</td><td class="wrap-text">${env.STRIPE_SECRET_KEY ? 'Stripe（テスト）' : 'シミュレータ（署名検証は本番と同じ）'}</td><td class="wrap-text">Stripe</td></tr>
        <tr><td>暗号鍵</td><td class="wrap-text">${env.DATA_KEY ? '個別の鍵' : '開発用の共通鍵'}</td><td class="wrap-text">協会ごとに作った鍵を Secrets に保管</td></tr>
        <tr><td>ボット判定</td><td class="wrap-text">${env.TURNSTILE_SITE_KEY ? '有効' : '無効'}</td><td class="wrap-text">Turnstile</td></tr>
        <tr><td>バックアップ</td><td class="wrap-text">${env.BACKUP ? 'R2 に日次' : 'なし'}</td><td class="wrap-text">R2 に日次・90 日保持</td></tr>
      </table></div>
    </div>` : ''}

    <p class="mute">関連: <a href="/privacy">会員情報共同利用規程・プライバシーポリシー（案）</a></p>`;
  return c.html(page(c, { title: 'セキュリティと個人情報の取扱い', en: 'SECURITY', body, member: c.get('member'), admin: c.get('admin'), wide: true, lead: '会員の氏名・連絡先・支払記録をどう守り、誰がどこまで見られるのか、何かあったときにどう動くのかをまとめています。会員の方にも、事務局の方にも読んでいただくためのページです。' }));
});

info.get('/privacy', async (c) => {
  const env = c.env;
  const assocs = await all<Association>(env.DB, "SELECT * FROM associations ORDER BY (id LIKE '%pref%') DESC, name");
  const names = assocs.length ? assocs.map((a) => a.name).join('、') : '参加する各テニス協会';
  const body = html`
    <div class="flash">この規程は役員会での承認前の<b>案</b>です。確定したものは各協会のサイトにも掲載し、会員登録時に同意をいただきます。</div>
    <h2>1. 共同利用の主体と目的</h2>
    <div class="card"><p>${names}（以下「参加協会」）は、会員の情報を 1 つの会員マスターで共同利用します。目的は、年度登録の受付と承認、大会エントリーの受付と参加資格の判定、入金の確認、大会運営（ドロー作成・結果の公表）、会員への連絡です。</p></div>
    <h2>2. 共同利用する情報</h2>
    <div class="card"><ul class="bullet-list"><li>姓・名、せい・めい、性別、生年、所属</li><li>メールアドレス、電話番号、郵便番号、住所</li><li>年度登録、大会エントリー、ペア、支払の記録</li></ul><p class="mute">生年月日は持たず、年齢区分の判定に必要な生年だけを預かります。</p></div>
    <h2>3. 閲覧できる範囲</h2>
    <div class="card"><ul class="bullet-list"><li>県協会: 県登録のある会員全員</li><li>各市協会: 自市に登録のある会員のみ</li><li>県と市の両方に登録がある会員は双方から見えます</li><li>連絡先（メール・電話・住所）を見られるのは、登録先の協会の事務局（協会管理ロール）だけです</li></ul></div>
    <h2>4. 大会主催者の権限</h2>
    <div class="card"><p>主催協会は自大会のエントリーを承認・消込します。県大会で市協会が受付を代行する場合は、大会単位で「大会運営」ロールを付与します。大会運営に渡るのは氏名・所属・クラスだけです。</p></div>
    <h2>5. 管理責任者と窓口</h2>
    <div class="card"><p>各協会に 1 名の<b>個人情報管理責任者</b>を置き、管理者アカウントの発行と年 1 回の棚卸し、開示・訂正・削除の請求への対応を担います。本人からの請求はどの協会で受けても共通の窓口に回し、30 日以内に対応します。</p></div>
    <h2>6. 安全管理措置</h2>
    <div class="card"><p>連絡先の列暗号化、協会ごとの閲覧範囲の分離、閲覧・出力・更新の監査ログ、日次バックアップ、退会後 2 年での連絡先削除、管理者の 2 段階認証と年 1 回の権限棚卸しを行います。詳しくは<a href="/security">セキュリティと個人情報の取扱い</a>をご覧ください。</p></div>
    <h2>7. 委託先</h2>
    <div class="card"><p>Cloudflare（基盤・データベース・メール送信）、Stripe（決済）、Google（事務局の認証）、LINE（任意の通知）に取扱いを委託します。カード情報は Stripe が取り扱い、参加協会は保持しません。</p></div>
    <h2>8. システムの名義と費用</h2>
    <div class="card"><p>Cloudflare と GitHub の契約は幹事協会（鳥取市テニス協会）が持ち、他の参加協会は利用協定を結んで参加します。有料化した場合の費用は会員数比で按分します。Stripe と LINE のアカウントは協会ごとに持ちます。</p></div>
    <h2>9. 退会・削除</h2>
    <div class="card"><p>退会後 2 年で住所・電話・メールを削除し、氏名と大会成績の履歴だけを残します。本人からの削除請求にはこれにかかわらず 30 日以内に対応します。</p></div>
    <h2>10. 同意</h2>
    <div class="card"><p>会員登録時にこの規程への同意をいただきます。規程を変えるときは参加協会の合意を経て、各協会のサイトとこのページで公表します。</p></div>
    <p class="mute">未決事項（参加協会で協議中）: 年度の切替日の統一、Stripe 手数料の負担、LINE 通知の範囲、退会後の保持期間（案: 2 年）。</p>`;
  return c.html(page(c, { title: '会員情報共同利用規程・プライバシーポリシー（案）', en: 'PRIVACY', body, member: c.get('member'), admin: c.get('admin'), lead: '参加協会が会員情報をどのような目的で、どの範囲で共同利用するかを定めるものです。' }));
});
