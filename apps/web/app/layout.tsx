import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Risk Management Dashboard",
  description: "Real-time supply chain risk intelligence dashboard",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body style={{ margin: 0, padding: 0 }}>{children}</body>
    </html>
  );
}
