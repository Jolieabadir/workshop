import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Workshop — Spatial Brainstorming Copilot",
  description: "A 3D spatial brainstorming environment with voice and gesture control",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full flex flex-col" style={{ margin: 0, overflow: 'hidden' }}>
        {children}
      </body>
    </html>
  );
}
