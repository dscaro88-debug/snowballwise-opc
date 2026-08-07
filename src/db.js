// 零原生依赖 JSON 存储层。MVP 用文件系统，后续可整体替换为 Supabase/Postgres。
// 数据结构：users / orders / ledger / clicks / sessions / seq
import { readFileSync, writeFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const DATA_DIR = join(__dirname, '..', 'data');
const DB_FILE = join(DATA_DIR, 'store.json');

const EMPTY = {
  users: {},      // id -> user
  orders: [],     // {id, promoCode, orderAmount, commission, source, importedAt}
  ledger: [],     // {id, userId, type, amount, orderId, note, fromUserId, fromPromoCode, createdAt}
  withdrawals: [],// {id, userId, email, amount, status, payAccount, createdAt, paidAt, note}
  clicks: [],     // {promoCode, ts, ip}
  sessions: {},   // token -> userId
  seq: { userId: 0, orderId: 0, ledgerId: 0, withdrawalId: 0 }
};

let cache = null;

function ensure() {
  if (!existsSync(DATA_DIR)) mkdirSync(DATA_DIR, { recursive: true });
  if (!existsSync(DB_FILE)) {
    cache = structuredClone(EMPTY);
    persist();
  } else if (!cache) {
    cache = JSON.parse(readFileSync(DB_FILE, 'utf8'));
  }
  return cache;
}

function persist() {
  writeFileSync(DB_FILE, JSON.stringify(cache, null, 2));
}

export const db = {
  get state() { return ensure(); },
  save() { persist(); },
  nextId(key) { ensure(); return ++cache.seq[key]; }
};
