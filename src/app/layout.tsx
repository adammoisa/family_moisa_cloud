import type { Metadata } from "next";
import { Inter } from "next/font/google";
import { ThemeProvider } from "@/providers/theme-provider";
import { TRPCProvider } from "@/providers/trpc-provider";
import { TooltipProvider } from "@/components/ui/tooltip";
import { Toaster } from "sonner";
import "./globals.css";

const inter = Inter({
  variable: "--font-sans",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: {
    default: "Moisa Family Gallery",
    template: "%s | Moisa Family Gallery",
  },
  description:
    "A private collection of family memories — photos and videos spanning generations of the Moisa family.",
  icons: {
    icon: [
      { url: "/favicon-32.png", sizes: "32x32", type: "image/png" },
      { url: "/favicon-48.png", sizes: "48x48", type: "image/png" },
    ],
    apple: "/icon-192.png",
  },
  openGraph: {
    title: "Moisa Family Gallery",
    description:
      "A private collection of family memories — photos and videos spanning generations of the Moisa family.",
    images: [{ url: "/og-image.png", width: 1200, height: 630 }],
    type: "website",
  },
  twitter: {
    card: "summary_large_image",
    title: "Moisa Family Gallery",
    description:
      "A private collection of family memories — photos and videos spanning generations of the Moisa family.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html
      lang="en"
      suppressHydrationWarning
      className={`${inter.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col bg-background text-foreground font-sans">
        <ThemeProvider>
          <TRPCProvider>
            <TooltipProvider>{children}</TooltipProvider>
            <Toaster richColors position="top-center" />
          </TRPCProvider>
        </ThemeProvider>
      </body>
    </html>
  );
}
