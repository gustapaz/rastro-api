import type { Metadata } from "next";
import "./globals.css";
import { meta } from "../server/meta.mjs";
export const metadata: Metadata = {
  title: meta.title,
  description: meta.description,
  metadataBase: new URL(
    "https://" + meta.repo + "-gustapaz.starrylinen.chatgpt.site",
  ),
  alternates: { canonical: "/" },
  icons: { icon: "/favicon.svg" },
};
export default function Layout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="pt-BR">
      <body>{children}</body>
    </html>
  );
}
