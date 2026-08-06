const BASE = 'http://localhost:3000';
async function reg(email, ref) {
  const r = await fetch(`${BASE}/api/register`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, password: 'pw123', referrerCode: ref })
  });
  return r.json();
}
const t = Date.now();
const root = await reg(`mama${t}@x.com`);
const rc = root.user.promoCode, rt = root.token;
const l1 = await reg(`a${t}@x.com`, rc);
const l1c = l1.user.promoCode, l1t = l1.token;
const l2 = await reg(`b${t}@x.com`, l1c);
const l2c = l2.user.promoCode, l2t = l2.token;
console.log('ROOT=', rc, '| L1=', l1c, '| L2=', l2c);
await fetch(`${BASE}/api/link`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rt}` }, body: JSON.stringify({ destination: 'https://item.jd.com/100.html' }) });
const csv = `promo_code,order_amount,commission,source
${rc},300,45,jd
${l1c},200,30,cj
${l2c},150,22.5,jd`;
const imp = await fetch(`${BASE}/api/orders/import`, { method: 'POST', headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${rt}` }, body: JSON.stringify({ csv }) });
console.log('IMPORT', JSON.stringify((await imp.json()).details));
for (const [c, tk] of [[rc, rt], [l1c, l1t], [l2c, l2t]]) {
  const j = await (await fetch(`${BASE}/api/ledger`, { headers: { Authorization: `Bearer ${tk}` } })).json();
  console.log(`[${c}] 余额 ¥${j.balance} |`, j.ledger.map(l => `${l.type}:${l.amount}`).join(', '));
}
