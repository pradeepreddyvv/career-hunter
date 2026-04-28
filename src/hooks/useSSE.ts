"use client";

import { useState, useCallback, useRef } from "react";
import type { AIState, SSEEvent } from "@/types/interview";

interface UseSSEOptions {
  onToken?: (token: string) => void;
  onDone?: (data: string) => void;
  onError?: (error: string) => void;
}

export function useSSE(options?: UseSSEOptions) {
  const [state, setState] = useState<AIState>("idle");
  const [tokens, setTokens] = useState("");
  const [error, setError] = useState<string | null>(null);
  const abortRef = useRef<AbortController | null>(null);

  const send = useCallback(
    async (url: string, body: Record<string, unknown>) => {
      abortRef.current?.abort();
      const controller = new AbortController();
      abortRef.current = controller;

      setState("thinking");
      setTokens("");
      setError(null);

      try {
        const res = await fetch(url, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
          signal: controller.signal,
        });

        if (!res.ok) {
          const errData = await res.json().catch(() => ({ error: "Request failed" }));
          throw new Error(errData.error || `HTTP ${res.status}`);
        }

        const contentType = res.headers.get("content-type") || "";
        if (!contentType.includes("text/event-stream")) {
          const data = await res.json();
          setState("done");
          setTokens(JSON.stringify(data));
          options?.onDone?.(JSON.stringify(data));
          return data;
        }

        const reader = res.body!.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let accumulated = "";

        while (true) {
          const { done, value } = await reader.read();
          if (done) break;

          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n\n");
          buffer = lines.pop() || "";

          for (const line of lines) {
            if (!line.startsWith("data: ")) continue;
            const event: SSEEvent = JSON.parse(line.slice(6));

            switch (event.type) {
              case "thinking":
                setState("thinking");
                break;
              case "token":
                setState("streaming");
                accumulated += event.data || "";
                setTokens(accumulated);
                options?.onToken?.(event.data || "");
                break;
              case "done":
                setState("done");
                options?.onDone?.(event.data || accumulated);
                break;
              case "error":
                setState("error");
                setError(event.error || "Unknown error");
                options?.onError?.(event.error || "Unknown error");
                break;
            }
          }
        }

        return accumulated;
      } catch (err) {
        if ((err as Error).name === "AbortError") return;
        const msg = err instanceof Error ? err.message : "Unknown error";
        setState("error");
        setError(msg);
        options?.onError?.(msg);
      }
    },
    [options]
  );

  const abort = useCallback(() => {
    abortRef.current?.abort();
    setState("idle");
  }, []);

  const reset = useCallback(() => {
    setState("idle");
    setTokens("");
    setError(null);
  }, []);

  return { state, tokens, error, send, abort, reset };
}
