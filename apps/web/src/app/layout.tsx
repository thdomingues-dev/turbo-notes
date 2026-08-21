import type { Metadata, Viewport } from "next";
import { Inria_Serif, Inter } from "next/font/google";

import { AppProviders } from "./providers";

import "./globals.css";

const inter = Inter({
  subsets: ["latin"],
  display: "swap",
  variable: "--font-inter",
});

const inriaSerif = Inria_Serif({
  subsets: ["latin"],
  weight: ["300", "400", "700"],
  display: "swap",
  variable: "--font-inria-serif",
});

export const metadata: Metadata = {
  title: {
    default: "Notes",
    template: "%s · Notes",
  },
  description: "A calm, organized home for your notes.",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#FAF1E3",
};

const RootLayout = ({ children }: Readonly<{ children: React.ReactNode }>) => {
  return (
    <html
      lang="en"
      className={`${inter.variable} ${inriaSerif.variable}`}
      data-scroll-behavior="smooth"
    >
      <body>
        <AppProviders>{children}</AppProviders>
      </body>
    </html>
  );
};

export default RootLayout;
