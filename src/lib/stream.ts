import type { SSEEvent } from "@/types/interview";

export function createSSEStream(
  handler: (send: (event: SSEEvent) => void) => Promise<void>
): Response {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    async start(controller) {
      const send = (event: SSEEvent) => {
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(event)}\n\n`)
        );
      };

      try {
        await handler(send);
      } catch (err) {
        send({
          type: "error",
          error: err instanceof Error ? err.message : "Unknown error",
        });
      } finally {
        controller.close();
      }
    },
  });

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache",
      Connection: "keep-alive",
    },
  });
}

export function streamGeminiResponse(
  generateFn: () => AsyncIterable<string>,
  onComplete: (fullText: string) => void | Promise<void>
): (send: (event: SSEEvent) => void) => Promise<void> {
  return async (send) => {
    send({ type: "thinking" });

    let fullText = "";
    for await (const chunk of generateFn()) {
      fullText += chunk;
      send({ type: "token", data: chunk });
    }

    await onComplete(fullText);
    send({ type: "done", data: fullText });
  };
}
