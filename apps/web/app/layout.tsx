import "./globals.css";
import type { Metadata } from "next";

export const metadata: Metadata = {
  title: "ScholarSync",
  description: "Personal Reddit research reader"
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body>{children}</body>
    </html>
  );
}
