import type { Metadata } from "next";
import { Inter } from "next/font/google";
import "./globals.css";
import Sidebar from "@/components/Sidebar";
import MobileNav from "@/components/MobileNav";

const inter = Inter({ subsets: ["latin"] });

export const metadata: Metadata = {
  title: "Smart AgriSense — IoT Farm Dashboard",
  description:
    "AI-powered IoT dashboard for smallholder farms in Cameroon. Monitor sensors, detect crop diseases, and automate irrigation.",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="en">
      <body className={`${inter.className} bg-gray-50 text-gray-900 antialiased`}>
        {/* Desktop sidebar */}
        <Sidebar />

        {/* Main content — offset for sidebar on md+ */}
        <div className="md:ml-60 min-h-screen pb-20 md:pb-0">
          {children}
        </div>

        {/* Mobile bottom nav */}
        <MobileNav />
      </body>
    </html>
  );
}
