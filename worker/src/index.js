// 入口。/api/* は handleApi へ、それ以外は管理アプリの静的ファイル（admin/）を返す。
// 本番（wrangler）では run_worker_first により /api/* だけがここに来る。
import { handleApi } from './api.js';
import { GithubRepo } from './github.js';

export default {
  async fetch(request, env) {
    const url = new URL(request.url);
    if (url.pathname.startsWith('/api/')) {
      // ローカル検証（scripts/local-dev.mjs）では、GitHub の代わりに手元の git を使う
      const repo = env.__repo || new GithubRepo(env);
      return handleApi(request, env, repo);
    }
    return env.ASSETS.fetch(request);
  },
};
