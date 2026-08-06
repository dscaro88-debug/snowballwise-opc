// 注册/登录 + 两级推荐关系 + 会话。零原生依赖（crypto 内置）。
import { randomBytes, randomUUID, scryptSync, timingSafeEqual } from 'node:crypto';
import { db } from './db.js';

const MAX_DEPTH = 2; // 两级红线：买家向上最多 2 层推荐人（自购+一级+二级）

function hashPassword(pw, salt = randomBytes(16).toString('hex')) {
  const derived = scryptSync(pw, salt, 64).toString('hex');
  return `${salt}:${derived}`;
}
function verifyPassword(pw, stored) {
  const [salt, derived] = stored.split(':');
  const check = scryptSync(pw, salt, 64).toString('hex');
  return timingSafeEqual(Buffer.from(check), Buffer.from(derived));
}

function genPromoCode(email) {
  const base = (email.split('@')[0] || 'user').replace(/[^a-z0-9]/gi, '').toLowerCase().slice(0, 6);
  let code, tries = 0;
  do {
    code = (base + randomBytes(2).toString('hex').slice(0, 4)).slice(0, 12);
    tries++;
  } while (Object.values(db.state.users).some(u => u.promoCode === code) && tries < 20);
  return code;
}

export function register({ email, password, referrerCode }) {
  email = (email || '').trim().toLowerCase();
  if (!email || !password) throw new Error('邮箱和密码必填');
  if (Object.values(db.state.users).some(u => u.email === email)) throw new Error('邮箱已注册');

  let referrerId = null, depth = 0;
  if (referrerCode) {
    const ref = Object.values(db.state.users).find(u => u.promoCode === referrerCode);
    if (!ref) throw new Error('推荐码不存在');
    // 两级红线：推荐人自身已达最大层级(2)时不能再推荐，否则新用户会变第 3 层
    if (ref.depth >= MAX_DEPTH) throw new Error('超过两级分销红线，无法作为推荐人');
    referrerId = ref.id;
    depth = ref.depth + 1;
  }

  const id = String(db.nextId('userId'));
  const user = {
    id,
    email,
    passwordHash: hashPassword(password),
    promoCode: genPromoCode(email),
    referrerId,
    depth,
    balance: 0,
    destination: '',
    createdAt: new Date().toISOString()
  };
  db.state.users[id] = user;
  db.save();
  return user;
}

export function login({ email, password }) {
  email = (email || '').trim().toLowerCase();
  const user = Object.values(db.state.users).find(u => u.email === email);
  if (!user || !verifyPassword(password, user.passwordHash)) throw new Error('邮箱或密码错误');
  const token = randomUUID();
  db.state.sessions[token] = user.id;
  db.save();
  return { token, user };
}

export function getUserByToken(token) {
  if (!token) return null;
  const id = db.state.sessions[token];
  return id ? db.state.users[id] : null;
}

export function getUserById(id) { return db.state.users[id] || null; }

export function setDestination(userId, destination) {
  const u = db.state.users[userId];
  if (!u) throw new Error('用户不存在');
  u.destination = destination;
  db.save();
  return u;
}

// 从买家向上取最多 2 层推荐人（一级、二级）
export function upline(promoCode) {
  const buyer = Object.values(db.state.users).find(u => u.promoCode === promoCode);
  if (!buyer) return null;
  const chain = [];
  let cur = buyer.referrerId ? db.state.users[buyer.referrerId] : null;
  let level = 1;
  while (cur && level <= MAX_DEPTH) {
    chain.push({ user: cur, level });
    cur = cur.referrerId ? db.state.users[cur.referrerId] : null;
    level++;
  }
  return { buyer, chain };
}

export { MAX_DEPTH };
