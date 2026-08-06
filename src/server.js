// snowballwise OPC MVP 服务入口
import express from 'express';
import { db } from './db.js';
import {
  register, login, getUserByToken, getUserById, setDestination, upline
} from './auth.js';
import { importCsv, RATES } from './commission.js';

const app = express();
// CORS: allow snowballwise.com + Railway 自身域名访问 API
app.use((req, res, next) => {
  const origin = req.headers.origin || '';
  try {
    const hostname = new URL(origin).hostname;
    if (
      origin === 'https://snowballwise.com' ||
      origin === 'https://www.snowballwise.com' ||
      hostname.endsWith('.railway.app') ||
      hostname === 'snowballwise.com' ||
      hostname === 'www.snowballwise.com'
    ) {
      res.setHeader('Access-Control-Allow-Origin', origin);
      res.setHeader('Access-Control-Allow-Credentials', 'true');
      res.setHeader('Access-Control-Allow-Methods', 'GET,POST,OPTIONS');
      res.setHeader('Access-Control-Allow-Headers', 'Content-Type,Authorization');
    }
  } catch {}
  if (req.method === 'OPTIONS') return res.sendStatus(204);
  next();
});
app.use(express.json());
app.use(express.static('public'));

const HOST = process.env.HOST ||
  (process.env.RAILWAY_PUBLIC_DOMAIN ? `https://${process.env.RAILWAY_PUBLIC_DOMAIN}` :
    process.env.RAILWAY_STATIC_URL ? process.env.RAILWAY_STATIC_URL :
      'http://localhost:3000');

function auth(req, res, next) {
  const token = (req.headers.authorization || '').replace('Bearer ', '');
  const user = getUserByToken(token);
  if (!user) return res.status(401).json({ error: '未登录' });
  req.user = user;
  next();
}

app.post('/api/register', (req, res) => {
  try {
    const u = register(req.body);
    const token = login({ email: u.email, password: req.body.password }).token;
    res.json({ token, user: publicUser(u, req) });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.post('/api/login', (req, res) => {
  try {
    const { token, user } = login(req.body);
    res.json({ token, user: publicUser(user, req) });
  } catch (e) { res.status(401).json({ error: e.message }); }
});

app.get('/api/me', auth, (req, res) => {
  res.json({ user: publicUser(req.user, req) });
});

app.post('/api/link', auth, (req, res) => {
  const dest = (req.body.destination || '').trim();
  if (dest) setDestination(req.user.id, dest);
  res.json({ referralLink: `${HOST}/go/${req.user.promoCode}`, destination: req.user.destination });
});

// 专属链接跳转：记录点击 + 种 subID cookie + 302 到注册页并带 ref=推广码
app.get('/go/:promoCode', (req, res) => {
  const code = req.params.promoCode;
  const user = Object.values(db.state.users).find(u => u.promoCode === code);
  if (!user) return res.status(404).send('推广码不存在');
  db.state.clicks.push({ promoCode: code, ts: new Date().toISOString(), ip: req.ip });
  db.save();
  res.cookie('sb_subid', code, { maxAge: 30 * 24 * 3600 * 1000, httpOnly: true });
  const dest = user.destination || 'https://www.snowballwise.com';
  const sep = dest.includes('?') ? '&' : '?';
  // 带 ref=推广码 跳转到注册页，让对方注册时自动成为该用户的一级
  res.redirect(`${dest}${sep}ref=${code}`);
});

// 商品点击追踪（前端 deals 页带 promoCode 上报，用于归属"谁点了什么"）
app.post('/api/track', (req, res) => {
  const { promoCode, sku, name } = req.body || {};
  if (!promoCode) return res.status(400).json({ error: '缺 promoCode' });
  db.state.clicks.push({
    promoCode, sku: sku || '', name: name || '',
    typed: 'product', ts: new Date().toISOString(), ip: req.ip
  });
  db.save();
  res.json({ ok: true });
});

// 联盟报表 CSV 导入（MVP 用 Bearer token 鉴权，后续换管理员角色）
app.post('/api/orders/import', auth, (req, res) => {
  try {
    const text = req.body.csv || '';
    const result = importCsv(text);
    res.json(result);
  } catch (e) { res.status(400).json({ error: e.message }); }
});

app.get('/api/ledger', auth, (req, res) => {
  const entries = db.state.ledger.filter(l => l.userId === req.user.id)
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt));
  res.json({ balance: req.user.balance, ledger: entries });
});

app.get('/api/config', (req, res) => {
  res.json({ rates: RATES, maxDepth: 2 });
});

// 管理员后台：用环境变量 ADMIN_TOKEN 保护
function adminAuth(req, res, next) {
  const t = req.headers['x-admin-token'] || req.query.token || '';
  if (!process.env.ADMIN_TOKEN || t !== process.env.ADMIN_TOKEN) {
    return res.status(401).json({ error: '管理员口令错误' });
  }
  next();
}

app.get('/api/admin/stats', adminAuth, (req, res) => {
  const s = db.state;
  const users = Object.values(s.users).map(u => {
    const downline = Object.values(s.users).filter(x => x.upline === u.promoCode);
    const l2 = downline.flatMap(d => Object.values(s.users).filter(x => x.upline === d.promoCode));
    return {
      id: u.id,
      email: u.email,
      promoCode: u.promoCode,
      depth: u.depth,
      upline: u.upline || '',
      balance: u.balance,
      createdAt: u.createdAt,
      l1Count: downline.length,
      l2Count: l2.length,
      clicks: s.clicks.filter(c => c.promoCode === u.promoCode).length
    };
  }).sort((a, b) => (b.createdAt || '').localeCompare(a.createdAt || ''));
  res.json({
    totalUsers: users.length,
    totalClicks: s.clicks.length,
    totalLedger: s.ledger.length,
    totalOrders: s.orders.length,
    users
  });
});

// 原始 JSON 导出（数据备份用）
app.get('/api/admin/export', adminAuth, (req, res) => {
  res.setHeader('Content-Type', 'application/json');
  res.setHeader('Content-Disposition', 'attachment; filename="snowballwise-export.json"');
  res.send(JSON.stringify(db.state, null, 2));
});

// 管理员导入联盟订单报表（CSV：promo_code,order_amount,commission,source）
app.post('/api/admin/orders/import', adminAuth, (req, res) => {
  try {
    const text = (req.body && req.body.csv) || '';
    const result = importCsv(text);
    res.json({ ...result, totalOrders: db.state.orders.length });
  } catch (e) { res.status(400).json({ error: e.message }); }
});

function publicUser(u, req) {
  return {
    id: u.id, email: u.email, promoCode: u.promoCode,
    balance: u.balance, depth: u.depth,
    referralLink: `${HOST}/go/${u.promoCode}`,
    destination: u.destination
  };
}

const PORT = process.env.PORT || 3000;
app.listen(PORT, () => console.log(`snowballwise OPC MVP → http://localhost:${PORT}`));
