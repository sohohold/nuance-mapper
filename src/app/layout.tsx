import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Nuance Mapper",
  description: "言葉の機微を、地図のように探索する。",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="ja">
      <body className="antialiased">{children}</body>
    </html>
  );
}
