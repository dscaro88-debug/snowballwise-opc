// 两级分佣引擎 + 联盟报表 CSV 导入 + 账本。
// 分佣比例（占联盟佣金 commission 的比例，可调）：
//   自购返现(BUYER) 50% | 一级(L1) 30% | 二级(L2) 10% | 平台留存 10%
import { db } from './db.js';
import { upline } from './auth.js';

export const RATES = {
  BUYER: 0.50,
  L1: 0.30,
  L2: 0.10,
  PLATFORM: 0.10
};

function addLedger(userId, type, amount, orderId, note, fromUserId, fromPromoCode) {
  const entry = {
    id: String(db.nextId('ledgerId')),
    userId, amount: Number(amount.toFixed(2)),
    type, orderId, note: note || '',
    fromUserId: fromUserId || null,
    fromPromoCode: fromPromoCode || null,
    createdAt: new Date().toISOString()
  };
  db.state.ledger.push(entry);
  db.state.users[userId].balance = Number((db.state.users[userId].balance + entry.amount).toFixed(2));
  return entry;
}

// 处理一笔订单：归属买家 -> 自购返现 + 向上两级分佣
export function applyOrder({ promoCode, orderAmount, commission, source }) {
  const link = upline(promoCode);
  if (!link) throw new Error(`推广码 ${promoCode} 不存在`);
  const { buyer, chain } = link;

  const orderId = String(db.nextId('orderId'));
  db.state.orders.push({
    id: orderId, promoCode, orderAmount: Number(orderAmount),
    commission: Number(commission), source: source || 'unknown', importedAt: new Date().toISOString()
  });

  const entries = [];
  // 买家自购返现
  entries.push(addLedger(buyer.id, 'rebate_self', commission * RATES.BUYER, orderId, '自购返现', buyer.id, buyer.promoCode));
  // 一级 / 二级
  for (const { user, level } of chain) {
    const rate = level === 1 ? RATES.L1 : RATES.L2;
    entries.push(addLedger(user.id, `rebate_L${level}`, commission * rate, orderId, `L${level} 推荐分佣`, buyer.id, buyer.promoCode));
  }
  db.save();
  return { orderId, buyer: buyer.promoCode, entries };
}

// 极简 CSV 解析（支持引号包裹与逗号）
export function parseCsv(text) {
  const rows = [];
  let field = '', row = [], inQ = false;
  for (let i = 0; i < text.length; i++) {
    const c = text[i];
    if (inQ) {
      if (c === '"') { if (text[i + 1] === '"') { field += '"'; i++; } else inQ = false; }
      else field += c;
    } else {
      if (c === '"') inQ = true;
      else if (c === ',') { row.push(field); field = ''; }
      else if (c === '\n' || c === '\r') {
        if (field !== '' || row.length) { row.push(field); rows.push(row); row = []; field = ''; }
      } else field += c;
    }
  }
  if (field !== '' || row.length) { row.push(field); rows.push(row); }
  return rows.filter(r => r.length && r.some(v => v.trim() !== ''));
}

// 期望表头：promo_code,order_amount,commission,source
export function importCsv(text) {
  const rows = parseCsv(text);
  if (!rows.length) return { imported: 0, errors: ['空文件'] };
  const header = rows[0].map(h => h.trim().toLowerCase());
  const idx = {
    code: header.indexOf('promo_code'),
    amount: header.indexOf('order_amount'),
    commission: header.indexOf('commission'),
    source: header.indexOf('source')
  };
  if (idx.code < 0 || idx.commission < 0) throw new Error('CSV 必须含 promo_code 与 commission 列');

  const result = { imported: 0, errors: [], details: [] };
  for (let i = 1; i < rows.length; i++) {
    const r = rows[i];
    try {
      const promoCode = (r[idx.code] || '').trim();
      const orderAmount = parseFloat(r[idx.amount]);
      const commission = parseFloat(r[idx.commission]);
      const source = (idx.source >= 0 ? r[idx.source] : '').trim() || 'unknown';
      if (!promoCode || isNaN(commission)) throw new Error('缺 promo_code 或 commission');
      const out = applyOrder({ promoCode, orderAmount, commission, source });
      result.imported++;
      result.details.push(out);
    } catch (e) {
      result.errors.push(`第${i + 1}行: ${e.message}`);
    }
  }
  return result;
}
