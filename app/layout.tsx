import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "cooked.ai admin", template: "%s · cooked.ai admin" },
  description: "Stats and moderation for cooked.ai. Superadmins only.",
  robots: { index: false, follow: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="en" className="h-full antialiased">
      <body className="min-h-full font-sans">{children}</body>
    </html>
  );
}
