import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "VoiceToText - Transcripción en tiempo real",
  description: "Transcripción de voz a texto en español usando Whisper",
};

export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="es">
      <body className="bg-gray-950 text-white antialiased">{children}</body>
    </html>
  );
}
