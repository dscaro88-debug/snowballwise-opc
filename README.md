# snowballwise OPC 系统 MVP

宝妈版「淘宝客 + 两级返现」操作系统的最小可用骨架。**先跑通国内联盟（A 线）数据闭环，海淘（B 线）并行用报表导入**。支付先用微信转账，商户号后办。

## 运行

```bash
cd ~/Desktop/联盟营销/snowballwise/opc-system
npm install
npm start          # http://localhost:3000
# 浏览器打开 http://localhost:3000/earn.html 体验注册→拿码→生成链接
```

零原生依赖：存储用本地 `data/store.json`，密码用内置 crypto，会话用 UUID。后续可整体替换为 Supabase（auth + Postgres）。

## 业务逻辑（两级分销红线）

- 注册生成专属推广码（promo code），可填推荐码。
- **两级上限强制**：推荐人 depth 已达 2 时无法再推荐（禁止三级）。
- 联盟报表按 `promo_code` 归属买家 → 计算：
  - 自购返现 **50%** | 一级 30% | 二级 10% | 平台留存 10%（占联盟佣金比例，见 `src/commission.js` RATES）
  - 平台至少留存 10%；当买家向上不足两级时，未分配的上级份额也归平台（如一级用户自购，二级 10% 自动归平台）。

## API

| 方法 | 路径 | 说明 |
|---|---|---|
| POST | `/api/register` | `{email,password,referrerCode?}` → token + 用户 |
| POST | `/api/login` | `{email,password}` → token |
| GET | `/api/me` | 返回推广码、余额、专属链接（需 Bearer token） |
| POST | `/api/link` | `{destination}` 设置你的联盟链接，返回 `/go/{code}` |
| GET | `/go/:code` | 专属链接跳转：记点击 + 种 subID cookie + 302 到商家 |
| POST | `/api/orders/import` | `{csv}` 导入联盟报表（表头见下） |
| GET | `/api/ledger` | 当前用户账本 + 余额 |

## 联盟报表 CSV 格式

```csv
promo_code,order_amount,commission,source
mama001,300,45,jd
friendA01,200,30,cj
```

- `promo_code`：买家推广码（归属用）
- `order_amount`：订单金额（仅展示）
- `commission`：联盟佣金（分佣基数）
- `source`：jd / taobao / cj 等

## 测试全链路

```bash
# 1) 注册 top 用户 mama001
curl -s -X POST localhost:3000/api/register -H 'Content-Type: application/json' \
  -d '{"email":"mama001@x.com","password":"pw123"}'

# 2) 用 mama001 的推广码注册 friendA01（一级）
curl -s -X POST localhost:3000/api/register -H 'Content-Type: application/json' \
  -d '{"email":"a@x.com","password":"pw123","referrerCode":"<mama001的码>"}'

# 3) 用 friendA01 的码注册 friendB01（二级）
curl -s -X POST localhost:3000/api/register -H 'Content-Type: application/json' \
  -d '{"email":"b@x.com","password":"pw123","referrerCode":"<friendA01的码>"}'

# 4) 导入 sample/orders.csv（用 mama001 登录后的 token）
curl -s -X POST localhost:3000/api/orders/import -H 'Authorization: Bearer <token>' \
  -H 'Content-Type: application/json' \
  -d "{\"csv\":\"$(cat sample/orders.csv | sed 's/"/""/g' | paste -sd,' ')\"}"
```

预期：mama001 自购返现 + 作为二级拿到 friendB01 的 10%；friendA01 拿到 mama001 一级 + friendB01 一级。

## 迁移到生产（阶段二后段）

1. 用户/会话 → Supabase Auth；数据表 users / orders / ledger。
2. 联盟对接：国内接淘宝联盟 / 京东联盟 API 自动回传；海淘 CJ/ShareASale 先 CSV 导入，后接报表 API。
3. 支付：申请微信/支付宝商户号，提现从「微信转账」切到自动打款。
4. 前端：earn 页并入 snowballwise.com（Astro 站），与 deals / earn-taobaoke / earn-haitao 打通。
