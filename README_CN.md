中文版 README

项目介绍

STL Model Crawler & Viewer 是一款基于现代前端技术开发的STL模型管理工具，专注于建筑类STL模型的爬虫搜索、3D在线预览、本地上传下载及个人模型库管理，为用户提供一站式的STL模型获取与管理解决方案。

技术栈

- 前端框架：Next.js + TypeScript

- 3D可视化：Three.js（用于STL模型在线预览）

- UI组件库：shadcn/ui + Tailwind CSS

- 网络请求：Axios（接口请求）、Cheerio（网页爬虫解析）

核心功能

1. STL模型爬虫搜索：支持建筑类STL模型关键词搜索，返回可下载资源及相关站点信息

2. 3D在线预览：通过Three.js实现STL模型实时预览，支持旋转、缩放等交互操作

3. 本地上传/下载：支持本地STL文件上传至系统，也可下载搜索到的模型至本地

4. 个人模型库：管理已上传/下载的本地模型，支持预览、再次下载及删除操作

核心文件结构

src/
├── app/
│   ├── page.tsx                  # 项目入口页面（包含搜索、上传、模型库标签页）
│   └── api/
│       ├── search-stl/route.ts   # 模型搜索接口（爬虫+本地模型搜索）
│       ├── list-stl/route.ts     # 本地模型列表查询接口
│       ├── upload-stl/route.ts   # 本地模型上传接口
│       ├── download-stl/route.ts # 模型下载接口（简化版）
│       └── proxy-download/route.ts # 跨域下载代理接口（解决外部资源跨域问题）
└── components/
    ├── STLModelCard.tsx          # 模型卡片组件（用于个人模型库展示）
    └── STLViewer.tsx             # 3D预览组件（基于Three.js实现）

模型存储目录

本地上传/下载的STL模型统一存储在 public/stl-models 目录下，可直接访问该目录管理模型文件。

使用说明

1. 搜索模型：在「Search & Download」标签页输入关键词（如“中式亭子”“徽派民居”），点击搜索即可获取相关STL模型资源

2. 上传模型：在「Search & Download」标签页点击上传按钮，选择本地STL文件完成上传，上传后可在个人模型库查看

3. 预览模型：在个人模型库点击模型卡片的「View」按钮，即可在线预览3D模型

4. 下载模型：搜索结果或个人模型库中，点击「Download」按钮即可下载模型至本地

