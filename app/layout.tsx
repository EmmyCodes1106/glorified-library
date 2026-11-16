import type { Metadata } from "next";
import { Inter, Geist_Mono } from "next/font/google";
import { getLibraryIdentity } from "@/lib/settings";
import "./globals.css";

const inter = Inter({
  variable: "--font-inter",
  subsets: ["latin"],
  display: "swap",
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

const themeScript = `(function(){try{var s=localStorage.getItem("glorified-theme");var d=s==="dark"||((!s||s==="system")&&window.matchMedia("(prefers-color-scheme: dark)").matches);var r=document.documentElement;r.classList.toggle("dark",d);r.style.colorScheme=d?"dark":"light";}catch(e){}})();`;

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
      suppressHydrationWarning
      className={`${inter.variable} ${geistMono.variable} h-full antialiased`}
    >
      <body className="min-h-full">
        <script dangerouslySetInnerHTML={{ __html: themeScript }} />
        {children}
      </body>
    </html>
  );
}
