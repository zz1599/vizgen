# VizGen · 看板工厂

> AI Agent 驱动的数据看板生成平台 —— 从一份数据到一块看板，只需要一段对话。

VizGen 是一个类似 [Atoms](https://atoms.dev/) 能力的垂直化 AI 应用生成平台：用户上传 CSV 数据并用自然语言描述需求，Agent 流水线（Planner → Builder → Checker → Fixer → Render）自动完成图表规划、代码生成、配置校验与修复，最终产出一个**自包含的、可交互、可分享的数据看板网页应用**，并在工作台中实时预览。

## 在线体验

- 平台地址：**https://vizgen.onrender.com**（Render 免费实例：15 分钟无访问会休眠，首次打开约需 30-60 秒唤醒；重新部署后 SQLite 数据重置，演示账号与示例看板会自动重新播种）
- 源码仓库：**https://github.com/zz1599/vizgen**
- 演示账号：`demo@vizgen.dev` / `demo1234`（已预置一个生成完成的销售看板项目）
- 分享链接示例：平台内点击「分享看板」生成 `/s/<版本ID>` 公开链接

## 核心功能

| 功能 | 说明 |
|---|---|
| 注册 / 登录 | 邮箱 + 密码，scrypt 哈希存储，HMAC 签名 Token（30 天有效） |
| 数据导入 | CSV 文件上传 / 粘贴文本 / 内置示例数据，自动解析并推断字段类型（数值 / 类别 / 日期） |
| Agent 生成 | 步骤流式展示：解析数据 → 规划布局 → 生成配置 → 校验匹配 → 自动修复 → 渲染应用 |
| 实时预览 | 生成的看板在 iframe 沙箱中即时渲染，支持桌面 / 移动视图切换 |
| 对话式迭代 | "把柱状图换成折线图"、"标题改成销售业绩总览"、"删除饼图，加一个KPI" 均可增量生效 |
| 代码 / 配置视图 | 可查看生成应用的真实源码与看板配置 JSON（含版本间变更摘要） |
| 版本管理 | 每次生成自动快照，可切换历史版本 |
| 公开分享 | 每个版本都有只读分享链接，无需登录即可访问 |
| 数据持久化 | SQLite 存储（用户 / 项目 / 数据集 / 版本 / 消息），服务重启数据不丢失 |

## 双通道生成架构（稳定性设计）

```
用户需求 ──► LLM 通道（LLM_API_KEY 已配置时）
                │  输出结构化 JSON 配置（图表类型+字段映射+聚合方式）
                ▼
            Checker 校验（字段存在性、类型匹配、聚合合法性）
                │ 失败 ──► Fixer 自动修复（剔除/纠正非法图表）
                ▼
            HTML 渲染引擎（确定性模板，LLM 只做决策不写 UI 代码）
                │
用户需求 ──► 规则引擎通道（无 Key / LLM 失败时自动降级）
                字段类型 → 默认图表组合；关键词 → 增量修改
```

**LLM 只输出结构化配置，看板 HTML 由确定性引擎渲染**——因此生成结果永远可解析、可校验、可兜底，产品不会因 LLM 波动而翻车。

## 快速开始

```bash
npm install
npm start          # 默认 http://localhost:3000
```

可选：配置 LLM 通道（**推荐**，不配置则自动使用规则引擎，功能完整可用）

```bash
# 方式一：项目根目录新建 .env（服务启动时自动加载，已在 .gitignore 中）
LLM_API_KEY=sk-xxxx
LLM_BASE_URL=https://api.deepseek.com
LLM_MODEL=deepseek-chat

# 方式二：直接设置同名环境变量（部署平台推荐，如 Vercel / Render 的控制台）
```

已用 DeepSeek `deepseek-chat` 实测：生成与修改请求均由 LLM 规划，UI 上显示「LLM 规划」徽章；Key 无效或调用失败时自动降级到规则引擎，不会中断演示。

UI 冒烟检查（需本机装有 Edge）：

```bash
node scripts/ui-check.js
```

受限网络下推送代码到 GitHub（`github.com:443` 被阻断时）：

```bash
# 走 GitHub 官方 SSH 备用通道（ssh.github.com:443）
# 1) 生成密钥并把 ~/.ssh/id_ed25519.pub 加到 https://github.com/settings/keys
ssh-keygen -t ed25519 -N "" -C "vizgen-push" -f ~/.ssh/id_ed25519
# 2) 配置 ssh 走 443 端口
printf 'Host github.com\n  HostName ssh.github.com\n  Port 443\n  User git\n  IdentityFile ~/.ssh/id_ed25519\n  StrictHostKeyChecking accept-new\n' > ~/.ssh/config
# 3) 使用 SSH 远程地址推送
git remote set-url origin git@github.com:<你的用户名>/vizgen.git && git push -u origin main

# 备选：仅 api.github.com 可达时，用 REST API 逐文件上传（需 PAT）
GITHUB_TOKEN=ghp_xxx node scripts/api-push.js <owner> <repo>
```

## 技术栈

- **后端**：Node.js 22 + Express + node:sqlite（零原生编译依赖）
- **前端**：原生 SPA（无框架、无构建步骤），设计系统手写 CSS
- **生成应用**：自包含单文件 HTML，ECharts（CDN）渲染，内置维度筛选与响应式布局
- **AI**：OpenAI 兼容 Chat API（JSON 模式），已用 DeepSeek `deepseek-chat` 实测通过；未配置或调用失败时降级到内置规则引擎

## 项目结构

```
vizgen/
├── server.js            # 入口：API 路由、NDJSON 流式生成、分享链接、种子数据
├── lib/
│   ├── db.js            # SQLite 建表与连接
│   ├── auth.js          # scrypt 密码哈希 + HMAC Token
│   ├── csv.js           # CSV 解析与字段类型推断
│   ├── engine.js        # 规则引擎 / 配置校验修复 / 看板 HTML 渲染
│   ├── llm.js           # LLM 通道（可降级）
│   ├── pipeline.js      # Agent 流水线（异步生成器，逐步骤产出事件）
│   └── sample.js        # 内置示例数据
├── public/              # 前端 SPA（无构建步骤）
│   ├── index.html
│   ├── css/style.css
│   └── js/              # api.js / app.js / sample.js
├── scripts/             # ui-check.js（UI 冒烟） / api-push.js（受限网络下经 API 推送）
├── shots/               # UI 截图
├── README.md            # 项目说明
├── DESIGN.md            # 设计决策与取舍（含线上问题定位记录）
└── PROJECT.md           # 项目说明（实现思路 / 完成程度 / 扩展计划）
```
