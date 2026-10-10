// GitHub への読み書き。REST API（Contents / Git Data / Actions）だけを使う。
//
// 書き込みは必ず「1回の公開 = 1コミット」にする。複数ファイル（JSON と画像）を
// blob → tree → commit → ref 更新 の順でまとめるので、途中で失敗しても main は変わらない。
// 秘密のトークン（GITHUB_TOKEN）はこの Worker の中にしか無い。

const API = 'https://api.github.com';

export class GithubRepo {
  constructor(env) {
    this.repo = env.GITHUB_REPO;
    this.branch = env.GITHUB_BRANCH || 'main';
    this.token = env.GITHUB_TOKEN;
  }

  async req(method, path, body) {
    const res = await fetch(`${API}/repos/${this.repo}${path}`, {
      method,
      headers: {
        Authorization: `Bearer ${this.token}`,
        Accept: 'application/vnd.github+json',
        'X-GitHub-Api-Version': '2022-11-28',
        'User-Agent': 'tcta-admin',
        ...(body ? { 'Content-Type': 'application/json' } : {}),
      },
      body: body ? JSON.stringify(body) : undefined,
    });
    if (res.status === 404) return null;
    if (!res.ok) throw new Error(`GitHub ${method} ${path} → ${res.status} ${(await res.text()).slice(0, 300)}`);
    return res.status === 204 ? {} : res.json();
  }

  /** main の先頭コミット */
  async head() {
    const ref = await this.req('GET', `/git/ref/heads/${this.branch}`);
    const commit = await this.req('GET', `/git/commits/${ref.object.sha}`);
    return { sha: ref.object.sha, tree: commit.tree.sha };
  }

  /** テキストファイルを読む。無ければ null。 */
  async readText(path, ref = this.branch) {
    const r = await this.req('GET', `/contents/${encodePath(path)}?ref=${ref}`);
    if (!r) return null;
    const bin = atob(r.content.replace(/\n/g, ''));
    const bytes = Uint8Array.from(bin, (c) => c.charCodeAt(0));
    return { text: new TextDecoder().decode(bytes), sha: r.sha };
  }

  async readJson(path, ref) {
    const r = await this.readText(path, ref);
    return r ? { data: JSON.parse(r.text), sha: r.sha } : null;
  }

  /** 1コミットにまとめて書く。files: [{ path, text } | { path, base64 } | { path, delete: true }] */
  async commit({ message, author, files }) {
    const head = await this.head();
    const tree = [];
    for (const f of files) {
      if (f.delete) {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        continue;
      }
      const blob = f.base64 !== undefined
        ? await this.req('POST', '/git/blobs', { content: f.base64, encoding: 'base64' })
        : await this.req('POST', '/git/blobs', { content: f.text, encoding: 'utf-8' });
      tree.push({ path: f.path, mode: '100644', type: 'blob', sha: blob.sha });
    }
    const newTree = await this.req('POST', '/git/trees', { base_tree: head.tree, tree });
    const commit = await this.req('POST', '/git/commits', {
      message, tree: newTree.sha, parents: [head.sha], author, committer: author,
    });
    await this.req('PATCH', `/git/refs/heads/${this.branch}`, { sha: commit.sha, force: false });
    return commit.sha;
  }

  /** あるコミットで変わったファイルの一覧 */
  async changedFiles(sha) {
    const c = await this.req('GET', `/commits/${sha}`);
    if (!c) return null;
    return {
      sha: c.sha,
      parent: c.parents[0]?.sha ?? null,
      message: c.commit.message,
      files: c.files.map((f) => ({ path: f.filename, status: f.status, previous: f.previous_filename })),
    };
  }

  /** あるコミット時点のファイルの blob sha（無ければ null） */
  async blobShaAt(path, ref) {
    const r = await this.req('GET', `/contents/${encodePath(path)}?ref=${ref}`);
    return r ? r.sha : null;
  }

  /**
   * コミット sha を取り消す。そのコミットで変わったファイルを、1つ前の状態に戻す
   * 新しいコミットを main に積む（履歴は消さない）。
   */
  async revert({ sha, message, author }) {
    const info = await this.changedFiles(sha);
    if (!info || !info.parent) throw new Error('戻せるコミットではありません');
    const head = await this.head();
    const tree = [];
    for (const f of info.files) {
      if (f.status === 'added') {
        tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
      } else {
        const prevPath = f.previous || f.path;
        const blob = await this.blobShaAt(prevPath, info.parent);
        if (f.status === 'renamed') tree.push({ path: f.path, mode: '100644', type: 'blob', sha: null });
        if (blob) tree.push({ path: prevPath, mode: '100644', type: 'blob', sha: blob });
      }
    }
    const newTree = await this.req('POST', '/git/trees', { base_tree: head.tree, tree });
    const commit = await this.req('POST', '/git/commits', {
      message, tree: newTree.sha, parents: [head.sha], author, committer: author,
    });
    await this.req('PATCH', `/git/refs/heads/${this.branch}`, { sha: commit.sha, force: false });
    return commit.sha;
  }

  /** そのコミットに対する GitHub Actions（公開）の進み具合 */
  async deployStatus(sha) {
    const r = await this.req('GET', `/actions/runs?head_sha=${sha}&per_page=5`);
    const run = r?.workflow_runs?.[0];
    if (!run) return { state: 'queued' };
    if (run.status !== 'completed') return { state: 'running', url: run.html_url };
    return { state: run.conclusion === 'success' ? 'done' : 'failed', url: run.html_url };
  }
}

const encodePath = (p) => p.split('/').map(encodeURIComponent).join('/');
