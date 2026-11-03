import type { Metadata, Viewport } from "next";
import { Atkinson_Hyperlegible_Next } from "next/font/google";
import "./globals.css";

// Designed for legibility by the Braille Institute: clear 1/l/I and 0/O on
// the lab floor, projectors and phone screens alike.
const atkinson = Atkinson_Hyperlegible_Next({
  subsets: ["latin"],
  weight: ["400", "600", "700"],
  variable: "--font-atkinson",
  display: "swap",
});

export const metadata: Metadata = {
  title: "Labora",
  description: "Gestión académica y operativa de laboratorios",
};

export const viewport: Viewport = {
  themeColor: "#6c1d45",
};

export default function RootLayout({
  children,
}: Readonly<{ children: React.ReactNode }>) {
  return (
    <html lang="es" className={atkinson.variable}>
      <body>{children}</body>
    </html>
  );
}
