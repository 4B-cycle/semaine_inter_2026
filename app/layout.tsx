import type { Metadata, Viewport } from "next";
import { Inter } from "next/font/google";
import "./globals.css";

const inter = Inter({ subsets: ["latin"] });

// 1. Configuration des métadonnées (Le Manifest est lié ici)
export const metadata: Metadata = {
  title: "Hub Vocal",
  description: "Application d'accessibilité vocale",
  manifest: "/manifest.json",
  appleWebApp: {
    capable: true,
    statusBarStyle: "default",
    title: "Hub Vocal",
  },
};

// 2. Configuration de la vue (Empêche le zoom automatique sur iPhone)
export const viewport: Viewport = {
  themeColor: "#2563eb",
  width: "device-width",
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="fr">
      <head>
        {/* Icône spécifique pour l'écran d'accueil Apple */}
        <link rel="apple-touch-icon" href="/icon-192.png" />
      </head>
      <body className={inter.className} suppressHydrationWarning>
        {children}
      </body>
    </html>
  );
}
