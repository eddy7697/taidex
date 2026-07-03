import "./globals.css";
import type { Metadata, Viewport } from "next";
import Providers from "@/components/Providers";
export const metadata: Metadata = { title: "Taidex 台股看板", description: "台股自選股看盤" };
// 看盤點擊頻繁,禁止雙擊/兩指縮放(iOS Safari 會忽略 meta,靠 globals.css 的 touch-action 補)
export const viewport: Viewport = { width: "device-width", initialScale: 1, maximumScale: 1, userScalable: false };
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-Hant">
      <body><Providers>{children}</Providers></body>
    </html>
  );
}
