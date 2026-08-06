# snowballwise OPC 系统 · 部署指南

后端已本地验证通过（注册→两级推荐→分佣→账本全链路 OK，两级红线生效）。
本地用 `data/store.json` 存数据，**但 Vercel 无服务器环境文件系统只读、冷启动丢数据**，上线必须解决持久化。

## 推荐路径（最快上线，零代码改动）：Railway + 挂载卷

Railway 给容器挂一个持久卷，把 `data/` 挂上去，JSON 存储原样保留，代码一行都不用改。

1. 去 [railway.app](https://railway.app) 用 GitHub 登录（免费额度够 MVP）。
2. New Project → Deploy from GitHub repo → 选 `dscaro88-debug/shengxin-haiwai`？**不**，OPC 后端在独立目录，建议：
   - 把 `opc-system/` 单独推一个仓库（或在此仓库内用 `railway.toml` 指定 root），
   - 或直接在 Railway 里 `New Project → Empty Project → 挂 GitHub 的 opc-system 子目录`。
3. 添加 Volume：项目里 Add → Volume，挂载路径填 `/app/data`（容器工作目录需对应）。
4. 生成域名（railway 给一个 `xxx.up.railway.app`），或在 Vercel 把 `api.snowballwise.com` CNAME 到它。
5. 部署后访问 `https://你的域名/api/config` 应返回分佣比例。

> 此路径无需数据库、无需改代码，最适合先把 B 跑起来验证真实用户。

## 规模路径（你已有账号，更稳）：Supabase + Vercel

需要把 `src/db.js` 的同步 JSON 读写改成 Supabase 异步调用（一次重构），并：
1. Supabase 后台建项目 → SQL Editor 执行 `supabase/schema.sql`（表已备好）。
2. 把 `SUPABASE_URL` + `SUPABASE_SERVICE_ROLE_KEY` 填进 `.env`（见 `.env.example`）。
3. 把 `opc-system` 作为独立 Vercel 项目部署到 `api.snowballwise.com`，用 `vercel.json` 跑 Node 函数。

> 此路径工作量更大（异步重构 + 部署配置），适合确认 B 跑通、要长期规模化时再做。

## 当前阻塞（只有 CARO 能做的动作）

- 选 Railway 还是 Supabase+Vercel（我推荐先 Railway，最快见真用户）。
- 注册对应平台账号并把仓库/Key 接好。
- 之后 `earn.html` 的 `/api/*` 才能真正在线上工作，宝妈注册→拿码→分享→两级分佣闭环成立。

## 上线后 `earn.html` 怎么接

`public/earn.html` 已写好调 `/api/register`、`/api/link`、`/api/me`、`/api/ledger`。
把它放进 snowballwise.com（作为一个静态页 `/earn`），并让前端 `/api` 指向 OPC 后端域名即可。
