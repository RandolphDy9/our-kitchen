import type { Metadata, Viewport } from "next";
import { Oswald, Work_Sans } from "next/font/google";
import "./globals.css";

const oswald = Oswald({ subsets: ["latin"], weight: ["500", "600", "700"], variable: "--font-oswald", display: "swap" });
const workSans = Work_Sans({ subsets: ["latin"], weight: ["400", "500", "600", "700", "800"], variable: "--font-work-sans", display: "swap" });

export const metadata: Metadata = {
  title: "OurKitchen",
  description: "Pickleball tournament check-in, live courts, playoffs and photos.",
  applicationName: "OurKitchen",
  appleWebApp: { capable: true, title: "OurKitchen", statusBarStyle: "default" },
  formatDetection: { telephone: false },
  icons: {
    icon: [{ url: "/icons/icon-192.png", sizes: "192x192", type: "image/png" }, { url: "/icons/icon.svg", type: "image/svg+xml" }],
    apple: [{ url: "/icons/apple-touch-icon.png", sizes: "180x180" }],
  },
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#f7f6f2",
  colorScheme: "light",
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={`${oswald.variable} ${workSans.variable}`}>
      {/* Extensions (e.g. ColorZilla's cz-shortcut-listen) add attributes to <body> before React hydrates. */}
      <body suppressHydrationWarning>{children}</body>
    </html>
  );
}
