import { GoogleGenerativeAI } from "@google/generative-ai";

export type AIProvider = "gemini" | "openai";

function getProvider(): AIProvider {
  if (process.env.GEMINI_API_KEY) return "gemini";
  if (process.env.OPENAI_API_KEY) return "openai";
  throw new Error("No AI provider configured. Set GEMINI_API_KEY or OPENAI_API_KEY in .env.local");
}

export interface AIResponse {
  text: string;
  provider: AIProvider;
}

export async function generateText(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string; model?: string }
): Promise<AIResponse> {
  const provider = getProvider();

  if (provider === "gemini") {
    return generateGemini(prompt, options);
  }
  return generateOpenAI(prompt, options);
}

async function generateGemini(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string; model?: string }
): Promise<AIResponse> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: options?.model || "gemini-2.5-pro",
    systemInstruction: options?.systemPrompt,
  });

  const result = await model.generateContent({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
    },
  });

  const text = result.response.text();
  return { text, provider: "gemini" };
}

async function generateOpenAI(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string; model?: string }
): Promise<AIResponse> {
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const messages: { role: string; content: string }[] = [];

  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options?.model || "gpt-4o",
      messages,
      temperature: options?.temperature ?? 0.7,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return { text: data.choices[0].message.content, provider: "openai" };
}

export async function generateJSON<T>(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string }
): Promise<T> {
  const result = await generateText(prompt, {
    ...options,
    systemPrompt: (options?.systemPrompt || "") + "\n\nRespond ONLY with valid JSON. No markdown, no explanation.",
  });

  const jsonStr = result.text.replace(/```json\n?/g, "").replace(/```\n?/g, "").trim();
  return JSON.parse(jsonStr) as T;
}

export async function* generateStream(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string; model?: string }
): AsyncGenerator<string> {
  const provider = getProvider();

  if (provider === "gemini") {
    yield* streamGemini(prompt, options);
  } else {
    yield* streamOpenAI(prompt, options);
  }
}

async function* streamGemini(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string; model?: string }
): AsyncGenerator<string> {
  const genAI = new GoogleGenerativeAI(process.env.GEMINI_API_KEY!);
  const model = genAI.getGenerativeModel({
    model: options?.model || "gemini-2.5-pro",
    systemInstruction: options?.systemPrompt,
  });

  const result = await model.generateContentStream({
    contents: [{ role: "user", parts: [{ text: prompt }] }],
    generationConfig: {
      temperature: options?.temperature ?? 0.7,
    },
  });

  for await (const chunk of result.stream) {
    const text = chunk.text();
    if (text) yield text;
  }
}

async function* streamOpenAI(
  prompt: string,
  options?: { temperature?: number; systemPrompt?: string; model?: string }
): AsyncGenerator<string> {
  const baseUrl = process.env.OPENAI_BASE_URL || "https://api.openai.com/v1";
  const messages: { role: string; content: string }[] = [];

  if (options?.systemPrompt) {
    messages.push({ role: "system", content: options.systemPrompt });
  }
  messages.push({ role: "user", content: prompt });

  const res = await fetch(`${baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "Content-Type": "application/json",
      Authorization: `Bearer ${process.env.OPENAI_API_KEY}`,
    },
    body: JSON.stringify({
      model: options?.model || "gpt-4o",
      messages,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    }),
  });

  if (!res.ok) {
    throw new Error(`OpenAI API error: ${res.status} ${await res.text()}`);
  }

  const reader = res.body!.getReader();
  const decoder = new TextDecoder();
  let buffer = "";

  while (true) {
    const { done, value } = await reader.read();
    if (done) break;

    buffer += decoder.decode(value, { stream: true });
    const lines = buffer.split("\n");
    buffer = lines.pop() || "";

    for (const line of lines) {
      if (line.startsWith("data: ") && line !== "data: [DONE]") {
        const data = JSON.parse(line.slice(6));
        const content = data.choices?.[0]?.delta?.content;
        if (content) yield content;
      }
    }
  }
}
