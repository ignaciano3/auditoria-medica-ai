import { settings } from "@audit/lib/i18n";
import type { Metadata } from "next";
import Link from "next/link";
import { BrandMark } from "../components/icons.tsx";
import { ThemeToggle } from "../components/theme-toggle.tsx";
import { themeInitScript } from "../lib/theme.ts";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auditoría Médica",
  description: "Auditoría de historias clínicas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es" suppressHydrationWarning>
      <body className="flex min-h-dvh flex-col bg-background text-foreground antialiased">
        {/* biome-ignore lint/security/noDangerouslySetInnerHtml: theme bootstrap must run before paint to avoid a flash */}
        <script dangerouslySetInnerHTML={{ __html: themeInitScript }} />
        <header className="sticky top-0 z-10 border-b border-border bg-background/85 backdrop-blur">
          <div className="mx-auto flex h-14 w-full items-center px-3 sm:px-4">
            <Link
              className="flex items-center gap-2.5 rounded-md font-semibold tracking-tight transition-colors hover:text-brand focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
              href="/"
            >
              <BrandMark className="size-6" />
              <span>Auditoría Médica</span>
            </Link>
            <div className="ml-auto flex items-center gap-3">
              <Link
                className="text-sm text-muted-foreground transition-colors hover:text-brand"
                href="/settings"
              >
                {settings.title}
              </Link>
              <ThemeToggle />
            </div>
          </div>
        </header>
        {children}
      </body>
    </html>
  );
}
