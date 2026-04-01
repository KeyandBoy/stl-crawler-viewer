English Version README

Project Introduction

STL Model Crawler & Viewer is a STL model management tool developed based on modern front-end technologies. It focuses on crawler search, 3D online preview, local upload/download and personal model library management of architectural STL models, providing users with a one-stop solution for STL model acquisition and management.

Tech Stack

- Frontend Framework: Next.js + TypeScript

- 3D Visualization: Three.js (for STL model online preview)

- UI Component Library: shadcn/ui + Tailwind CSS

- Network Request: Axios (API requests), Cheerio (web crawler parsing)

Core Features

1. STL Model Crawler Search: Supports keyword search for architectural STL models, returning downloadable resources and related site information

2. 3D Online Preview: Real-time STL model preview via Three.js, supporting interactive operations such as rotation and scaling

3. Local Upload/Download: Supports uploading local STL files to the system, and downloading searched models to local

4. Personal Model Library: Manages uploaded/downloaded local models, supporting preview, re-download and deletion operations

Core File Structure

src/
├── app/
│   ├── page.tsx                  # Project entry page (includes search, upload, model library tabs)
│   └── api/
│       ├── search-stl/route.ts   # Model search API (crawler + local model search)
│       ├── list-stl/route.ts     # Local model list query API
│       ├── upload-stl/route.ts   # Local model upload API
│       ├── download-stl/route.ts # Model download API (simplified version)
│       └── proxy-download/route.ts # Cross-domain download proxy API (solves cross-domain issues of external resources)
└── components/
    ├── STLModelCard.tsx          # Model card component (for personal model library display)
    └── STLViewer.tsx             # 3D preview component (implemented based on Three.js)

Model Storage Directory

Locally uploaded/downloaded STL models are uniformly stored in thepublic/stl-models directory, and you can directly access this directory to manage model files.

Usage Instructions

1. Search Models: Enter keywords (e.g., "Chinese-style pavilion", "Huizhou-style residence") in the "Search & Download" tab, click Search to get relevant STL model resources

2. Upload Models: Click the upload button in the "Search & Download" tab, select a local STL file to complete the upload, and you can view it in the personal model library after upload

3. Preview Models: Click the "View" button on the model card in the personal model library to preview the 3D model online

4. Download Models: Click the "Download" button in the search results or personal model library to download the model to local


