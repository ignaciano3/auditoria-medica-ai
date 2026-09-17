import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Auditoría Médica",
  description: "Auditoría de historias clínicas",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="es">
      <body>{children}</body>
    </html>
  );
}
