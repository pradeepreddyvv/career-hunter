import { NextResponse } from "next/server";

export async function GET() {
  const apiKey = process.env.SPEECHMATICS_API_KEY;
  if (!apiKey) {
    return NextResponse.json(
      { error: "Speechmatics not configured. Using Web Speech API fallback.", fallback: true },
      { status: 200 }
    );
  }

  try {
    const res = await fetch("https://mp.speechmatics.com/v1/api_keys?type=rt", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${apiKey}`,
      },
      body: JSON.stringify({ ttl: 60 }),
    });

    if (!res.ok) {
      return NextResponse.json(
        { error: "Failed to generate temp key", fallback: true },
        { status: 200 }
      );
    }

    const data = await res.json();
    return NextResponse.json({ key: data.key_value });
  } catch {
    return NextResponse.json(
      { error: "Speechmatics service unavailable", fallback: true },
      { status: 200 }
    );
  }
}
