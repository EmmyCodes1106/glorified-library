import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { getLibraryIdentity } from "@/lib/settings";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export async function generateMetadata(): Promise<Metadata> {
  "use cache";
  const identity = await getLibraryIdentity();
  return {
    title: {
      default: `${identity.name} Manager`,
      template: `%s · ${identity.name} Manager`,
    },
    description: `${identity.name} lending catalogue`,
  };
}

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html
      lang="en"
      className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full flex flex-col">{children}</body>
    </html>
  );
}
