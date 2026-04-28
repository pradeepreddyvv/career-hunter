import { NextRequest, NextResponse } from "next/server";

export async function POST(request: NextRequest) {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speechmatics not configured. Use browser TTS.", fallback: true },
      { status: 200 }
    );
  }

  try {
    const { text, language } = await request.json();
    if (!text) {
      return NextResponse.json({ error: "text is required" }, { status: 400 });
    }

    const res = await fetch("https://mp.speechmatics.com/v1/tts", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        text,
        language: language || "en",
        output_format: { type: "wav", sample_rate: 22050 },
      }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "TTS generation failed", fallback: true },
        { status: 200 }
      );
    }

    const audioBuffer = await res.arrayBuffer();
    return new Response(audioBuffer, {
      headers: {
        "Content-Type": "audio/wav",
        "Content-Length": String(audioBuffer.byteLength),
      },
    });
  } catch {
    return NextResponse.json(
      { error: "TTS service unavailable", fallback: true },
      { status: 200 }
    );
  }
}
