// 同期ルーム（Durable Object）。ルームコード 1 つにつき 1 つ動く。
//
// GitHub Pages 版の中継サーバー（Render の sync-server/server.mjs）と同じ動きをする:
//   join      … ルームに入る。観戦端末（viewer: true）には、保持している最新の大会データをすぐ送る
//   cache     … 運営端末が最新の大会データ（スナップショット）を預ける。ほかの端末へは流さない
//   broadcast … ほかの端末へそのまま流す。snapshot-response なら最新の大会データとしても預かる
//   leave     … ルームから抜ける
//   ping      … pong を返す（Durable Object を起こさずに Cloudflare 側で自動応答する）
//
// Render 版との違い:
//   ・眠らない（接続のたびに数十秒待つことがない）。待っているあいだは WebSocket Hibernation で課金も止まる
//   ・預かった大会データはメモリではなく Durable Object の SQLite に置くので、再起動や配備で消えない
//   ・観戦端末（viewer）から大会データの変更は流さない（観戦用 URL を知っているだけの人が運営のデータを書き換えられないように）
//   ・運営端末として入れるのは役員ログインを通った人だけ（Worker が確かめて X-Sync-Role で渡す）
import { DurableObject } from 'cloudflare:workers';
import type { Env } from './index';

interface Attachment {
  viewer: boolean;
  left: boolean;
}

/** 1 行に入れる文字数（SQLite の 1 行は 2 MB まで。日本語は UTF-8 で 3 バイトなので余裕を見る） */
const CHUNK = 500_000;
/** 預かった大会データの保存は、この間隔より細かくは行わない（Free プランの書き込み行数を節約） */
const PERSIST_INTERVAL_MS = 10_000;
/** これより古い大会データは観戦端末へ送らない（前の大会の残りを出さないため） */
const SNAPSHOT_TTL_MS = 3 * 24 * 60 * 60 * 1000;
/** 観戦端末が流してよいメッセージ（参加・離脱の通知と、データの要求だけ） */
const VIEWER_ALLOWED = new Set(['request-snapshot', 'device-hello', 'device-bye']);

export class SyncRoom extends DurableObject<Env> {
  private snapshot: string | null = null;
  private snapshotAt = 0;
  private dirty = false;
  private lastPersistAt = 0;

  constructor(ctx: DurableObjectState, env: Env) {
    super(ctx, env);
    // クライアントは 15 秒おきに {"action":"ping"} を送る。オブジェクトを起こさずに応答する
    this.ctx.setWebSocketAutoResponse(new WebSocketRequestResponsePair('{"action":"ping"}', '{"action":"pong"}'));
    this.ctx.blockConcurrencyWhile(async () => {
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS snapshot_chunk (seq INTEGER PRIMARY KEY, body TEXT NOT NULL)');
      this.ctx.storage.sql.exec('CREATE TABLE IF NOT EXISTS snapshot_meta (id INTEGER PRIMARY KEY CHECK (id = 1), updated_at INTEGER NOT NULL)');
      const meta = this.ctx.storage.sql.exec<{ updated_at: number }>('SELECT updated_at FROM snapshot_meta WHERE id = 1').toArray()[0];
      if (meta) {
        const rows = this.ctx.storage.sql.exec<{ body: string }>('SELECT body FROM snapshot_chunk ORDER BY seq').toArray();
        this.snapshot = rows.map((r) => r.body).join('') || null;
        this.snapshotAt = meta.updated_at;
        this.lastPersistAt = meta.updated_at;
      }
    });
  }

  async fetch(request: Request): Promise<Response> {
    if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') {
      return new Response('WebSocket で接続してください', { status: 426 });
    }
    const pair = new WebSocketPair();
    const [client, server] = Object.values(pair);
    this.ctx.acceptWebSocket(server);
    // 役割は Worker が役員ログインを確かめて決めたもの。観戦端末は join で運営端末を名乗っても観戦端末のまま
    const viewer = request.headers.get('X-Sync-Role') !== 'operator';
    server.serializeAttachment({ viewer, left: false } satisfies Attachment);
    return new Response(null, { status: 101, webSocket: client });
  }

  async webSocketMessage(ws: WebSocket, raw: string | ArrayBuffer): Promise<void> {
    if (typeof raw !== 'string') return;
    let data: { action?: string; roomCode?: string; viewer?: boolean; payload?: { type?: string } };
    try {
      data = JSON.parse(raw);
    } catch {
      return;
    }
    const att = (ws.deserializeAttachment() as Attachment | null) ?? { viewer: false, left: false };

    switch (data.action) {
      case 'ping':
        // 自動応答が効かない形（空白入りなど）で来たとき
        safeSend(ws, '{"action":"pong"}');
        return;

      case 'join': {
        // 運営端末が観戦端末として入り直す（viewer: true）ことはできる。逆はできない
        const viewer = att.viewer || data.viewer === true;
        ws.serializeAttachment({ viewer, left: false } satisfies Attachment);
        // 観戦端末には預かっている最新の大会データをすぐ送る（運営端末がいなくても見られる）。
        // 運営端末には送らない（手元の編集を上書きしないため）
        if (viewer) {
          const snap = this.freshSnapshot();
          if (snap) safeSend(ws, snap);
        }
        return;
      }

      case 'leave':
        ws.serializeAttachment({ ...att, left: true } satisfies Attachment);
        return;

      case 'cache':
        if (att.viewer || !data.payload) return;
        this.store(JSON.stringify(data.payload));
        return;

      case 'broadcast': {
        const payload = data.payload;
        if (!payload || att.left) return;
        if (att.viewer && !VIEWER_ALLOWED.has(String(payload.type))) return;
        const msg = JSON.stringify(payload);
        // 運営端末から観戦端末への全データ応答は、あとから入る観戦端末のためにも預かる
        if (payload.type === 'snapshot-response' && !att.viewer) this.store(msg);
        for (const other of this.ctx.getWebSockets()) {
          if (other === ws) continue;
          const a = other.deserializeAttachment() as Attachment | null;
          if (a?.left) continue;
          safeSend(other, msg);
        }
        return;
      }
    }
  }

  async webSocketClose(ws: WebSocket, code: number, reason: string): Promise<void> {
    try {
      ws.close(code === 1005 || code === 1006 ? 1000 : code, reason);
    } catch {
      // すでに閉じている
    }
  }

  async webSocketError(): Promise<void> {
    // 切断は webSocketClose で扱う
  }

  /** 保存を間引いていた分を書き出す */
  async alarm(): Promise<void> {
    if (this.dirty) this.persist();
  }

  private freshSnapshot(): string | null {
    if (!this.snapshot) return null;
    if (Date.now() - this.snapshotAt > SNAPSHOT_TTL_MS) return null;
    return this.snapshot;
  }

  private store(message: string): void {
    this.snapshot = message;
    this.snapshotAt = Date.now();
    this.dirty = true;
    const wait = this.lastPersistAt + PERSIST_INTERVAL_MS - Date.now();
    if (wait <= 0) {
      this.persist();
    } else {
      void this.ctx.storage.getAlarm().then((at) => {
        if (at == null) void this.ctx.storage.setAlarm(Date.now() + wait);
      });
    }
  }

  private persist(): void {
    if (!this.snapshot) return;
    const sql = this.ctx.storage.sql;
    const body = this.snapshot;
    this.ctx.storage.transactionSync(() => {
      sql.exec('DELETE FROM snapshot_chunk');
      for (let i = 0, seq = 0; i < body.length; i += CHUNK, seq++) {
        sql.exec('INSERT INTO snapshot_chunk (seq, body) VALUES (?, ?)', seq, body.slice(i, i + CHUNK));
      }
      sql.exec('INSERT INTO snapshot_meta (id, updated_at) VALUES (1, ?) ON CONFLICT(id) DO UPDATE SET updated_at = excluded.updated_at', this.snapshotAt);
    });
    this.dirty = false;
    this.lastPersistAt = Date.now();
  }
}

function safeSend(ws: WebSocket, msg: string): void {
  try {
    ws.send(msg);
  } catch {
    // 切れかけのソケット
  }
}
