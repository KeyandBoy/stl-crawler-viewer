// src/app/layout.tsx
import type { Metadata } from 'next';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const metadata: Metadata = {
  title: 'STL Model Crawler',
  description: 'Search and view STL 3D models',
};

// 核心修复：
// 1. 给 html/body 加 suppressHydrationWarning 禁用无关水合警告
// 2. 固定 className，避免动态值导致不匹配
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en" suppressHydrationWarning>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}