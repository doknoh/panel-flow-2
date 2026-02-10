import type { Metadata } from "next";
import "./globals.css";
import Providers from "./Providers";

export const metadata: Metadata = {
  title: "Panel Flow - Comic Script Writing",
  description: "Professional comic script writing tool for sequential art writers",
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body className="antialiased font-sans">
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
