# VizGen · AI 应用工厂

> 对话生成任何 Web 应用 —— 计算器、2048 游戏、番茄钟、待办清单、数据看板，一句话搞定。

VizGen 是一个具备 [Atoms](https://atoms.dev/) 类能力的 AI vibe coding 平台：用户用自然语言描述想要的应用，Agent 流水线（Planner → Builder → Checker → Fixer → Render）自动完成功能设计、代码生成、完整性校验与修复，最终产出一个**自包含、可交互、可分享的网页应用**，并在工作台中实时预览。平台支持两类项目：

- **🤖 AI 应用**：任意 Web 小应用（计算器 / 2048 / 待办 / 番茄钟 / 记事本 / 记账本…），LLM 直接生成完整单文件 HTML，校验失败自动修复，仍失败则降级内置同款模板兜底；支持对话式增量修改（"改成深色主题"、"加一个统计功能"）
- **📊 数据看板**：上传 CSV 数据并用自然语言描述需求，LLM 规划图表配置（结构化 JSON），确定性引擎渲染 ECharts 看板，支持对话式增删改图表

## 在线体验

- 平台地址：**https://vizgen.onrender.com**（Render 免费实例：15 分钟无访问会休眠，首次打开约需 30-60 秒唤醒；重新部署后 SQLite 数据重置，演示账号与示例项目会自动重新播种）
- 源码仓库：**https://github.com/zz1599/vizgen**
- 演示账号：`demo@vizgen.dev` / `demo1234`（已预置销售看板与 2048 小游戏两个示例项目）
- 分享链接示例：平台内点击「分享应用 / 分享看板」生成 `/s/<版本ID>` 公开链接

## 核心功能

| 功能 | 说明 |
|---|---|
| 注册 / 登录 | 邮箱 + 密码，scrypt 哈希存储，HMAC 签名 Token（30 天有效） |
| AI 应用生成 | 一句话描述 → LLM 生成完整单文件 HTML 应用（样式/交互/持久化全内联），支持桌面/移动预览 |
| 数据看板生成 | CSV 上传 / 粘贴 / 示例数据 → LLM 规划图表配置 → ECharts 渲染 |
| Agent 流水线 | 步骤流式展示：理解需求 → 设计方案 → 生成代码 → 完整性校验 → 自动修复 → 渲染应用 |
| 自检修复闭环 | Checker 真验证（HTML 结构完整性、交互逻辑存在性），失败携带错误反馈重试，仍失败降级内置模板（计算器/待办/番茄钟/2048/记事本），生成能力永不中断 |
| 对话式迭代 | "改成深色主题"、"把柱状图换成折线图"、"删除饼图，加一个KPI" 均可增量生效 |
| 实时预览 | 生成结果在 iframe 沙箱中即时渲染，支持桌面 / 移动视图切换 |
| 代码视图 | 可查看生成应用的真实 HTML 源码 |
| 版本管理 | 每次生成自动快照，可切换历史版本 |
| 公开分享 | 每个版本都有只读分享链接，无需登录即可访问 |
| 数据持久化 | SQLite 存储（用户 / 项目 / 数据集 / 版本 / 消息），服务重启数据不丢失 |

## 双通道生成架构（稳定性设计）

```
                 ┌── 🤖 应用模式 ────────────────────────────────────┐
用户需求 ──► LLM 通道：直接生成完整单文件 HTML 应用
                 │        ▼
                 │   Checker 校验（HTML 结构 / 交互逻辑 / 围栏残留）
                 │     失败 ──► Fixer 携带错误反馈重试 ──► 仍失败 ──► 内置模板兜底
                 │
                 └── 📊 看板模式 ────────────────────────────────────┐
用户需求+CSV ──► LLM 通道：输出结构化 JSON 配置（图表类型+字段+聚合）
                          ▼
                     Checker 校验（字段存在性、类型匹配、聚合合法性）
                       失败 ──► Fixer 自动修复（剔除/纠正非法图表）
                          ▼
                     HTML 渲染引擎（确定性模板，LLM 只做决策不写 UI 代码）

两条模式共享规则引擎降级通道（无 Key / LLM 失败时自动切换）：
  应用模式 → 内置模板（关键词匹配：计算器/待办/番茄钟/2048/记事本）
  看板模式 → 字段类型 → 默认图表组合；关键词 → 增量修改
```

**应用模式让 LLM 直接写代码（发挥表达力），看板模式让 LLM 只输出结构化配置（保证可控性），两条通道都以 Checker + Fixer + 兜底降级收尾**——生成结果永远可校验、可兜底，产品不会因 LLM 波动而翻车。

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
├── server.js            # 入口：API 路由、NDJSON 流式生成（双模式）、分享链接、种子数据
├── lib/
│   ├── db.js            # SQLite 建表、连接与版本迁移（versions 支持应用 HTML 落库）
│   ├── auth.js          # scrypt 密码哈希 + HMAC Token
│   ├── csv.js           # CSV 解析与字段类型推断
│   ├── engine.js        # 看板：规则引擎 / 配置校验修复 / 看板 HTML 渲染
│   ├── appgen.js        # 应用：LLM 输出清洗 / HTML 完整性校验 / 标题提取
│   ├── templates.js     # 应用兜底模板（计算器 / 待办 / 番茄钟 / 2048 / 记事本）
│   ├── llm.js           # LLM 通道（看板 JSON 模式 + 应用代码生成，可降级）
│   ├── pipeline.js      # Agent 流水线（异步生成器，双模式，逐步骤产出事件）
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
