import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "DocTalk VoiceToText — Transcripción en tiempo real",
  description:
    "Transcribe voz a texto en español en tiempo real usando Whisper. Procesamiento 100% local, sin enviar audio a la nube.",
  icons: { icon: "/icon.svg" },
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
