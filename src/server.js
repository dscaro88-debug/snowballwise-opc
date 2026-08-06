// snowballwise OPC MVP 服务入口
import express from 'express';
import { db } from './db.js';
import {
  register, login, getUserByToken, getUserById, setDestination, upline
} from './auth.js';
import { importCsv, RATES } from './commission.js';

const app = express();
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

// 专属链接跳转：记录点击 + 种 subID cookie + 302 到商家
app.get('/go/:promoCode', (req, res) => {
  const code = req.params.promoCode;
  const user = Object.values(db.state.users).find(u => u.promoCode === code);
  if (!user) return res.status(404).send('推广码不存在');
  db.state.clicks.push({ promoCode: code, ts: new Date().toISOString(), ip: req.ip });
  db.save();
  res.cookie('sb_subid', code, { maxAge: 30 * 24 * 3600 * 1000, httpOnly: true });
  const dest = user.destination || 'https://www.snowballwise.com';
  res.redirect(dest);
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
