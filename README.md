<div align="center">

# 🏛️ STL Model Crawler & Viewer

**中国古代建筑 3D 模型一站式搜索、预览与管理平台**

[![Next.js](https://img.shields.io/badge/Next.js-16.2-black?logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?logo=typescript)](https://www.typescriptlang.org/)
[![Three.js](https://img.shields.io/badge/Three.js-0.183-green?logo=three.js)](https://threejs.org/)
[![TensorFlow.js](https://img.shields.io/badge/TensorFlow.js-4.22-orange?logo=tensorflow)](https://tensorflow.google.cn/js)
[![Tailwind CSS](https://img.shields.io/badge/Tailwind_CSS-4.x-38bdf8?logo=tailwindcss)](https://tailwindcss.com/)
[![Vercel](https://img.shields.io/badge/Deploy-Vercel-black?logo=vercel)](https://vercel.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](LICENSE)

[English](#english-version) · [中文](#中文版本)

</div>

---

## 中文版本

### 📖 项目简介

**STL Model Crawler & Viewer** 是一款专注于**中国古代建筑 3D 模型**的一站式获取与管理工具。

无需手动逐站搜索——输入关键词，系统自动从 **Thingiverse、Printables、爱给网、3D溜溜网、Yeggi、Sketchfab** 等多个平台聚合搜索结果，提供**直接下载 STL** 或**跳转站点**两种获取方式，并支持在线 3D 预览、个人模型库管理。

> 🎓 本项目为大数据实践赛参赛作品，致力于中国古代建筑数字化保护与可视化展示。

---

### ✨ 核心功能

| 功能 | 说明 |
|------|------|
| 🔍 **多站点聚合搜索** | 同时检索 6 大平台，精选模型库 + 实时爬取双轨并行 |
| ⬇️ **直接下载 STL** | 对有真实下载链接的模型，一键下载到本地 |
| 🔗 **跳转站点查看** | 对需要登录/付费的模型，直接跳转原站详情页 |
| 🧊 **在线 3D 预览** | 基于 Three.js，支持旋转、缩放、拖拽交互 |
| 📁 **个人模型库** | 上传本地 STL 文件，云端存储（Vercel Blob），响应式网格展示 |
| 🧠 **AI 智能分类** | 基于 TensorFlow.js MobileNet，自动识别模型类型并重命名收纳 |
| 🏷️ **免费/付费标注** | 每条结果自动标注 ✓免费 / ⚠付费，一目了然 |
| 🧠 **关键词语义扩展** | 输入"亭子"自动扩展为"凉亭/六角亭/八角亭"等，提升召回率 |
| 🚫 **垃圾结果过滤** | 黑名单 + 模型提示词双重过滤，屏蔽无关页面 |

---

### 🧠 AI 智能分类功能

系统集成了 **TensorFlow.js MobileNet** 图像分类模型，可自动识别 STL 模型的类型：

#### 工作原理

```
STL 模型文件 → Three.js 多角度渲染 → 图像 → MobileNet 分类 → 自动分类/重命名
```

#### 功能特点

| 特性 | 说明 |
|------|------|
| 🎯 **自动识别** | 识别模型类型（亭子、塔、桥、龙、雕像等） |
| 📝 **自动重命名** | 将模型重命名为「分类名_原文件名.stl」格式 |
| 📂 **分类视图** | 按分类文件夹分组展示模型 |
| 🔄 **批量处理** | 一键对整个模型库进行分类 |

#### 使用方法

1. 进入「我的图书馆」标签
2. 点击「**一键分类收纳**」按钮
3. 系统自动：
   - AI 识别每个模型的类型
   - 自动重命名文件（如 `model.stl` → `凉亭_model.stl`）
   - 按分类显示模型列表
4. 可切换「**📋 列表**」或「**📂 分类**」视图查看

---

### 🛠️ 技术栈

```
前端框架     Next.js 16 (App Router + Turbopack)
语言         TypeScript 5
3D 渲染      Three.js 0.183
AI 推理      TensorFlow.js 4.22 + MobileNet
UI 组件      shadcn/ui + Radix UI
样式         Tailwind CSS 4
网络请求     Axios
网页解析     Cheerio（服务端爬虫）
云存储       Vercel Blob（个人模型库）
部署         Vercel / Railway
```

---

### 🔍 搜索机制详解

系统采用**四轨并行**搜索策略，结果按优先级合并去重：

```
① 本地模型库   → 已上传的个人 STL 文件（最高优先级）
② 精选模型库   → 28 条人工整理的真实可下载链接（永久兜底）
③ 实时爬取     → Yeggi / Thingiverse / 3D溜溜网 / 爱给网 实时抓取
④ 站点跳转     → 4 大平台搜索页直链（兜底保障）
```

**支持搜索的古建筑类型：**

> 亭子 · 塔 · 桥 · 牌坊 · 殿 · 庙 · 祠堂 · 四合院 · 园林 · 戏台 · 民居 · 龙 · 榫卯 · 斗拱 · 飞檐 · 徽派 · 客家 · 故宫 · 宝塔 · 廊桥 · 门楼 · 宗祠 ……

---

### 📁 项目结构

```
src/
├── app/
│   ├── page.tsx                      # 主页面（搜索/上传/模型库三标签页）
│   ├── layout.tsx                    # 全局布局
│   ├── globals.css                   # 全局样式
│   └── api/
│       ├── search-stl/route.ts       # 搜索接口（精选库 + 多站点爬虫 + 语义扩展）
│       ├── list-stl/route.ts         # 模型库列表（支持子文件夹递归扫描）
│       ├── upload-stl/route.ts       # 文件上传（Vercel Blob）
│       ├── download-stl/route.ts      # 文件删除（支持子文件夹）
│       ├── rename-stl/route.ts       # 🆕 文件重命名/分类（AI 分类核心）
│       └── proxy-download/route.ts    # 跨域下载代理
└── components/
    ├── STLModelCard.tsx              # 模型卡片（预览/下载/删除/AI分类）
    ├── STLViewer.tsx                 # 3D 预览组件（Three.js）
    └── STLClassifier.tsx             # 🆕 AI 分类组件（TensorFlow.js）
```

---

### 🚀 本地运行

**环境要求：** Node.js 18+，pnpm

```bash
# 1. 克隆项目
git clone https://github.com/KeyandBoy/stl-crawler-viewer.git
cd stl-crawler-viewer

# 2. 安装依赖
pnpm install

# 3. 配置环境变量（可选，用于个人模型库云存储）
cp .env.example .env.local
# 填入 BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# 4. 启动开发服务器
pnpm dev
```

打开 [http://localhost:3000](http://localhost:3000) 即可使用。

> ⚠️ 不配置 `BLOB_READ_WRITE_TOKEN` 时，搜索和预览功能正常，个人模型库上传功能不可用。

---

### ☁️ 部署到 Vercel（推荐）

#### 标准部署

1. Fork 本仓库到你的 GitHub
2. 打开 [vercel.com](https://vercel.com)，导入该仓库，点击 **Deploy**
3. 部署完成后，进入项目 **Storage → Create → Blob**，创建 Blob 存储
4. Vercel 会自动注入 `BLOB_READ_WRITE_TOKEN` 环境变量
5. 触发一次 **Redeploy** 使配置生效

#### Railway 部署

如需部署到 Railway：

1. Fork 本仓库到你的 GitHub
2. 在 [Railway](https://railway.app) 中创建新项目，选择 **Deploy from GitHub repo**
3. 选择你的仓库，Railway 会自动检测 Next.js 项目
4. 在环境变量中设置：
   - `BLOB_READ_WRITE_TOKEN`: 你的 Vercel Blob Token
   - `NEXT_PUBLIC_*`: 需要公开的环境变量
5. 部署完成后，系统会自动分配一个 `.railway.app` 域名

> 💡 **注意**：Railway 部署时，模型库存储仍使用 Vercel Blob（如已配置），本地开发模式则存储在 `public/stl-models/` 目录。

---

### 📖 使用说明

#### 搜索下载
1. 在搜索框输入关键词（如：`六角亭`、`廊桥`、`四合院`、`牌坊`）
2. 点击**搜索**或按 `Enter`
3. 结果卡片提供两种操作：
   - **▼ 直接下载 STL**（绿色按钮）：有真实文件链接时可用
   - **跳转站点查看详情**（蓝色按钮）：跳转至原站页面

#### 上传模型
1. 在「上传 STL 文件」区域选择本地 `.stl` 文件
2. 点击上传，文件存储至 Vercel Blob 云端
3. 上传后在「我的图书馆」标签页查看

#### AI 智能分类
1. 进入「我的图书馆」标签
2. 点击「**一键分类收纳**」按钮
3. 等待 AI 逐个识别并重命名模型
4. 点击「**📂 分类**」视图按分类查看

#### 个人模型库
- **View / Hide**：在线 3D 预览，支持鼠标旋转、滚轮缩放
- **Download**：重新下载到本地
- **🧠 AI 分类**：自动识别模型类型并归类
- **🗑️**：从模型库移除

---

### 🌐 数据来源

| 平台 | 类型 | 费用 |
|------|------|------|
| [Thingiverse](https://www.thingiverse.com) | 全球最大 3D 打印模型社区 | 免费 |
| [Printables](https://www.printables.com) | Prusa 官方模型平台 | 免费 |
| [Yeggi](https://www.yeggi.com) | 多平台 STL 聚合搜索引擎 | 免费 |
| [爱给网](https://www.aigei.com) | 国内 3D 模型资源平台 | 免费为主 |
| [3D溜溜网](https://www.3d66.com) | 国内专业 3D 模型平台 | 部分免费 |
| [Sketchfab](https://sketchfab.com) | 3D 模型展示与下载平台 | 部分免费 |

---

---

## English Version

### 📖 Introduction

**STL Model Crawler & Viewer** is a one-stop platform for discovering, previewing, and managing **Chinese ancient architecture 3D models** in STL format.

Instead of manually searching across multiple sites, simply enter a keyword and the system automatically aggregates results from **Thingiverse, Printables, Aigei, 3D66, Yeggi, and Sketchfab** — offering both **direct STL download** and **site redirect** options, along with online 3D preview and personal model library management.

> 🎓 Built as a Big Data Practice Competition project, dedicated to the digital preservation and visualization of Chinese ancient architecture.

---

### ✨ Features

| Feature | Description |
|---------|-------------|
| 🔍 **Multi-site Aggregated Search** | Searches 6 platforms simultaneously with curated library + live crawling |
| ⬇️ **Direct STL Download** | One-click download for models with real file links |
| 🔗 **Site Redirect** | Jump to original site for models requiring login or payment |
| 🧊 **Online 3D Preview** | Three.js-powered viewer with rotate, zoom, and drag support |
| 📁 **Personal Model Library** | Upload local STL files, stored in Vercel Blob cloud storage |
| 🧠 **AI Smart Classification** | TensorFlow.js MobileNet auto-identifies model types and renames files |
| 🏷️ **Free/Paid Labels** | Each result is automatically tagged ✓Free or ⚠Paid |
| 🧠 **Semantic Keyword Expansion** | "pavilion" auto-expands to "hexagonal pavilion / octagonal pavilion / gazebo" |
| 🚫 **Garbage Result Filtering** | Blacklist + model hint word dual-filter removes irrelevant pages |

---

### 🧠 AI Smart Classification

The system integrates **TensorFlow.js MobileNet** image classification model to automatically identify STL model types:

#### How It Works

```
STL Model File → Three.js Multi-angle Rendering → Image → MobileNet Classification → Auto-classify/Rename
```

#### Features

| Feature | Description |
|---------|-------------|
| 🎯 **Auto-Identify** | Recognizes model types (pavilion, tower, bridge, dragon, statue, etc.) |
| 📝 **Auto-Rename** | Renames files to 「CategoryName_OriginalName.stl」 format |
| 📂 **Category View** | Groups models by category folder |
| 🔄 **Batch Processing** | One-click classify entire model library |

---

### 🛠️ Tech Stack

```
Frontend      Next.js 16 (App Router + Turbopack)
Language      TypeScript 5
3D Rendering  Three.js 0.183
AI Inference  TensorFlow.js 4.22 + MobileNet
UI            shadcn/ui + Radix UI
Styling       Tailwind CSS 4
HTTP Client   Axios
HTML Parser   Cheerio (server-side crawler)
Cloud Storage Vercel Blob (personal model library)
Deployment    Vercel / Railway
```

---

### 🔍 Search Architecture

The system uses a **4-track parallel** search strategy, merging and deduplicating results by priority:

```
① Local Library    → User-uploaded STL files (highest priority)
② Curated Library  → 28 manually verified real download links (permanent fallback)
③ Live Crawling    → Real-time scraping from Yeggi / Thingiverse / 3D66 / Aigei
④ Site Redirects   → Direct search page links for 4 major platforms (safety net)
```

---

### 📁 Project Structure

```
src/
├── app/
│   ├── page.tsx                      # Main page (Search / Upload / Library tabs)
│   ├── layout.tsx                    # Global layout
│   ├── globals.css                   # Global styles
│   └── api/
│       ├── search-stl/route.ts       # Search API (curated + crawler + semantic expansion)
│       ├── list-stl/route.ts         # Library list (recursive subfolder scanning)
│       ├── upload-stl/route.ts       # File upload (Vercel Blob)
│       ├── download-stl/route.ts     # File deletion (subfolder support)
│       ├── rename-stl/route.ts       # 🆕 File rename/classify (AI classification core)
│       └── proxy-download/route.ts   # Cross-origin download proxy
└── components/
    ├── STLModelCard.tsx              # Model card (preview/download/delete/AI classify)
    ├── STLViewer.tsx                 # 3D viewer component (Three.js)
    └── STLClassifier.tsx             # 🆕 AI classifier component (TensorFlow.js)
```

---

### 🚀 Local Development

**Requirements:** Node.js 18+, pnpm

```bash
# 1. Clone the repository
git clone https://github.com/KeyandBoy/stl-crawler-viewer.git
cd stl-crawler-viewer

# 2. Install dependencies
pnpm install

# 3. Configure environment variables (optional, for cloud model library)
cp .env.example .env.local
# Fill in: BLOB_READ_WRITE_TOKEN=your_vercel_blob_token

# 4. Start development server
pnpm dev
```

Open [http://localhost:3000](http://localhost:3000) to use the app.

> ⚠️ Without `BLOB_READ_WRITE_TOKEN`, search and preview work normally; file upload to the personal library is unavailable.

---

### ☁️ Deploy to Vercel (Recommended)

#### Standard Deployment

1. Fork this repository to your GitHub account
2. Go to [vercel.com](https://vercel.com), import the repo, and click **Deploy**
3. After deployment, go to **Storage → Create → Blob** to create a Blob store
4. Vercel automatically injects the `BLOB_READ_WRITE_TOKEN` environment variable
5. Trigger a **Redeploy** to apply the configuration

#### Railway Deployment

To deploy on Railway:

1. Fork this repository to your GitHub account
2. Create a new project on [Railway](https://railway.app), select **Deploy from GitHub repo**
3. Choose your repository — Railway will auto-detect the Next.js project
4. Set environment variables:
   - `BLOB_READ_WRITE_TOKEN`: Your Vercel Blob Token
   - `NEXT_PUBLIC_*`: Public environment variables as needed
5. After deployment, Railway will assign a `.railway.app` domain

> 💡 **Note**: When deploying on Railway, model storage still uses Vercel Blob (if configured). In local development mode, files are stored in the `public/stl-models/` directory.

---

### 📖 Usage

#### Search & Download
1. Enter a keyword (e.g., `hexagonal pavilion`, `covered bridge`, `courtyard house`, `archway`)
2. Click **Search** or press `Enter`
3. Each result card offers two actions:
   - **▼ Direct Download STL** (green button): available when a real file link exists
   - **Jump to site for details** (blue button): redirects to the original page

#### Upload Models
1. Select a local `.stl` file in the "Upload STL File" section
2. Click upload — the file is stored in Vercel Blob cloud storage
3. View it in the **My Library** tab

#### AI Smart Classification
1. Go to the **My Library** tab
2. Click **「One-Click Classify」** button
3. Wait for AI to identify and rename each model
4. Switch to **「📂 Category」** view to browse by classification

#### Personal Library
- **View / Hide**: Online 3D preview with mouse rotate and scroll zoom
- **Download**: Re-download to local
- **🧠 AI Classify**: Auto-identify model type and categorize
- **🗑️**: Remove from library

---

### 🌐 Data Sources

| Platform | Type | Cost |
|----------|------|------|
| [Thingiverse](https://www.thingiverse.com) | World's largest 3D printing model community | Free |
| [Printables](https://www.printables.com) | Prusa's official model platform | Free |
| [Yeggi](https://www.yeggi.com) | Multi-platform STL aggregation search engine | Free |
| [Aigei](https://www.aigei.com) | Chinese 3D model resource platform | Mostly free |
| [3D66](https://www.3d66.com) | Professional Chinese 3D model platform | Partially free |
| [Sketchfab](https://sketchfab.com) | 3D model showcase and download platform | Partially free |

---

<div align="center">

**STL Model Crawler · 中国古代建筑博物馆可视化系统 · 大数据实践赛作品**

Made with ❤️ for Chinese architectural heritage

</div>
