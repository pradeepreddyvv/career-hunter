import { NextRequest, NextResponse } from "next/server";
import { GoogleGenerativeAI } from "@google/generative-ai";

export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get("file") as File | null;

    if (!file) {
      return NextResponse.json({ error: "No file uploaded" }, { status: 400 });
    }

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
      return NextResponse.json({ error: "File too large (max 10MB)" }, { status: 400 });
    }

    const buffer = Buffer.from(await file.arrayBuffer());
    const base64 = buffer.toString("base64");

    const mimeType = file.type || getMimeType(file.name);
    if (!["application/pdf", "image/png", "image/jpeg", "image/webp"].includes(mimeType)) {
      // For DOCX and other text formats, try direct text extraction
      if (file.name.endsWith(".txt") || file.name.endsWith(".md")) {
        const text = buffer.toString("utf-8");
        return NextResponse.json({ text, filename: file.name });
      }

      // For DOCX, send as binary to Gemini for extraction
      if (file.name.endsWith(".docx") || mimeType === "application/vnd.openxmlformats-officedocument.wordprocessingml.document") {
        // DOCX: extract text via Gemini vision as a document
        const text = await extractWithGemini(base64, "application/pdf", file.name);
        return NextResponse.json({ text, filename: file.name });
      }

      return NextResponse.json({ error: `Unsupported file type: ${mimeType}. Use PDF, DOCX, TXT, or image.` }, { status: 400 });
    }

    const text = await extractWithGemini(base64, mimeType, file.name);
    return NextResponse.json({ text, filename: file.name });
  } catch (error) {
    return NextResponse.json(
      { error: "Resume parsing failed", details: String(error) },
      { status: 500 }
    );
  }
}

async function extractWithGemini(base64Data: string, mimeType: string, filename: string): Promise<string> {
  const apiKey = process.env.GEMINI_API_KEY;
  if (!apiKey) {
    throw new Error("GEMINI_API_KEY not configured");
  }

  const genAI = new GoogleGenerativeAI(apiKey);
  const model = genAI.getGenerativeModel({ model: "gemini-2.5-flash" });

  const result = await model.generateContent({
    contents: [
      {
        role: "user",
        parts: [
          {
            inlineData: {
              mimeType,
              data: base64Data,
            },
          },
          {
            text: `Extract ALL text content from this resume document (${filename}).

Return the complete text content preserving the structure:
- Keep section headers (Education, Experience, Skills, Projects, etc.)
- Keep bullet points as-is
- Keep all dates, numbers, metrics, and proper nouns exactly as written
- Keep company names, job titles, degree names, school names verbatim
- Remove any formatting artifacts but preserve the logical structure

Return ONLY the extracted text. No commentary, no "Here is the extracted text:", no markdown formatting.`,
          },
        ],
      },
    ],
    generationConfig: {
      temperature: 0.1,
    },
  });

  return result.response.text().trim();
}

function getMimeType(filename: string): string {
  if (filename.endsWith(".pdf")) return "application/pdf";
  if (filename.endsWith(".png")) return "image/png";
  if (filename.endsWith(".jpg") || filename.endsWith(".jpeg")) return "image/jpeg";
  if (filename.endsWith(".webp")) return "image/webp";
  if (filename.endsWith(".docx")) return "application/vnd.openxmlformats-officedocument.wordprocessingml.document";
  if (filename.endsWith(".txt")) return "text/plain";
  if (filename.endsWith(".md")) return "text/markdown";
  return "application/octet-stream";
}
