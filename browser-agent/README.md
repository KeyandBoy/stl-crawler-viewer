# STL Crawler Browser Agent

本机 Playwright 浏览器代理，为 STL Crawler 提供真实浏览器搜索、登录和下载能力。

## 快速开始

```bash
cd browser-agent
npm install
npm run dev
```

启动后会显示配对码，在 Vercel 页面的"站点设置"中输入即可配对。

## 工作原理

1. 本机启动一个 HTTP 服务 (127.0.0.1:18789)
2. 用可见 Chromium 打开目标网站
3. 首次使用时用户手动登录
4. 持久化保存登录状态（browser-profile/ 目录）
5. 与 Vercel 页面通信，接收搜索/下载任务
6. 在真实浏览器中执行搜索，提取模型结果

## 安全机制

- 只监听 127.0.0.1，不开放局域网
- 首次使用需配对码
- 每次请求需携带 Token
- 只允许配置的站点域名
- 不执行远程传入的任意 JavaScript
- 不提供读取 Cookie 的接口
- Cookie 和登录状态不离开本机

## 环境变量

| 变量 | 默认值 | 说明 |
|---|---|---|
| BROWSER_AGENT_PORT | 18789 | 监听端口 |
| ALLOWED_ORIGINS | http://localhost:3000,... | 允许的 Vercel 页面地址 |

## API

| 端点 | 方法 | 说明 |
|---|---|---|
| /health | GET | 健康检查（无需认证） |
| /pairing-code | GET | 获取配对码（无需认证） |
| /pair | POST | 配对（传入 code） |
| /search | POST | 在真实浏览器中搜索（需认证） |
| /tasks/:id | GET | 查询任务状态 |
| /tasks/:id/cancel | POST | 取消任务 |
