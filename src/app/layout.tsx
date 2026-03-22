import type { Metadata } from "next";
import Image from "next/image";
import { Geist, Geist_Mono } from "next/font/google";
import { Providers } from "@/components/providers";
import { SidebarNav } from "@/components/ui/sidebar-nav";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "AutoReach",
  description: "Open-source multi-agent sales automation framework",
  icons: {
    icon: "/logo.png",
    apple: "/logo.png",
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        <Providers>
          <div className="min-h-screen bg-background text-foreground">
            <div className="mx-auto flex min-h-screen w-full max-w-[1400px]">
              <aside className="w-60 border-r p-4">
                <div className="mb-6 flex items-center gap-2">
                  <Image
                    src="/logo.svg"
                    alt="AutoReach"
                    width={32}
                    height={32}
                    className="w-16 h-16"
                  />
                  <span className="text-lg font-semibold">AutoReach</span>
                </div>
                <SidebarNav />
              </aside>
              <main className="flex-1 p-6">{children}</main>
            </div>
          </div>
        </Providers>
      </body>
    </html>
  );
}
