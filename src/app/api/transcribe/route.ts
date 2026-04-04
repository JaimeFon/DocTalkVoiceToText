import { NextRequest, NextResponse } from "next/server";

const WHISPER_API_URL = process.env.WHISPER_API_URL || "http://localhost:8000";

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se envió archivo de audio" }, { status: 400 });
  }

  const model = formData.get("model")?.toString() || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "base";
  const language = formData.get("language")?.toString() || "es";

  // Reenviar al endpoint OpenAI-compatible de Faster-Whisper
  const upstream = new FormData();
  upstream.append("file", file, file.name);
  upstream.append("model", model);
  upstream.append("language", language);

  const resp = await fetch(`${WHISPER_API_URL}/v1/audio/transcriptions`, {
    method: "POST",
    body: upstream,
  });

  if (!resp.ok) {
    const errText = await resp.text();
    return NextResponse.json(
      { error: `Whisper error ${resp.status}: ${errText}` },
      { status: resp.status }
    );
  }

  const data = await resp.json();
  return NextResponse.json({ text: data.text || "" });
}
