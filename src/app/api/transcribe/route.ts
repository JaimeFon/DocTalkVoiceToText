import { NextRequest, NextResponse } from "next/server";

const WHISPER_API_URL = process.env.WHISPER_API_URL || "http://localhost:8000";

// Prompt médico: condiciona a Whisper para reconocer terminología clínica
const MEDICAL_PROMPT = [
  "Consulta médica entre doctor y paciente.",
  "Diagnóstico, pronóstico, anamnesis, exploración física, auscultación, palpación.",
  "Hemograma, bioquímica, hemoglobina, hematocrito, leucocitos, plaquetas, creatinina, transaminasas, colesterol, triglicéridos, glucemia.",
  "Radiografía, ecografía, resonancia magnética, TAC, electrocardiograma, espirometría.",
  "Hipertensión arterial, diabetes mellitus tipo 2, dislipemia, cardiopatía isquémica, insuficiencia cardíaca.",
  "Neumonía, bronquitis, EPOC, asma, gastritis, reflujo gastroesofágico.",
  "Cefalea, migraña, lumbalgia, cervicalgia, artrosis, artritis, fibromialgia, neuropatía.",
  "Paracetamol, ibuprofeno, omeprazol, metformina, insulina, enalapril, losartán, atorvastatina.",
  "Amoxicilina, azitromicina, ciprofloxacino, dexametasona, prednisona.",
  "Miligramos, comprimidos, posología, cada 8 horas, en ayunas.",
  "Tensión arterial, frecuencia cardíaca, saturación de oxígeno.",
  "Antecedentes familiares, alergias medicamentosas, intervenciones quirúrgicas.",
].join(" ");

export async function POST(req: NextRequest) {
  const formData = await req.formData();
  const file = formData.get("file") as File | null;

  if (!file) {
    return NextResponse.json({ error: "No se envió archivo de audio" }, { status: 400 });
  }

  const model = formData.get("model")?.toString() || process.env.NEXT_PUBLIC_DEFAULT_MODEL || "base";
  const language = formData.get("language")?.toString() || "es";
  const prompt = formData.get("prompt")?.toString() || MEDICAL_PROMPT;

  // Reenviar al endpoint OpenAI-compatible de Faster-Whisper
  const upstream = new FormData();
  upstream.append("file", file, file.name);
  upstream.append("model", model);
  upstream.append("language", language);
  upstream.append("prompt", prompt);

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
