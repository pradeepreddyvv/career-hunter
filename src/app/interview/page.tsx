"use client";

import { useState, useCallback, useRef } from "react";
import AppNav from "@/components/AppNav";
import InterviewConfig from "@/components/interview/InterviewConfig";
import QuestionCard from "@/components/interview/QuestionCard";
import RecordingPanel from "@/components/interview/RecordingPanel";
import FeedbackCard from "@/components/interview/FeedbackCard";
import SessionSummaryCard from "@/components/interview/SessionSummary";
import { useSSE } from "@/hooks/useSSE";
import { useRecording } from "@/hooks/useRecording";
import type {
  InterviewFormat,
  Question,
  FeedbackResult,
  SessionSummary,
  AIState,
} from "@/types/interview";

type Phase = "config" | "interview" | "summary";

interface SessionState {
  id: string;
  format: InterviewFormat;
  company: string;
  questions: Question[];
  currentIndex: number;
  maxFollowUps: number;
  answers: { question: Question; feedback: FeedbackResult }[];
}

export default function InterviewPage() {
  const [phase, setPhase] = useState<Phase>("config");
  const [session, setSession] = useState<SessionState | null>(null);
  const [currentFeedback, setCurrentFeedback] = useState<FeedbackResult | null>(null);
  const [sessionSummary, setSessionSummary] = useState<SessionSummary | null>(null);
  const [manualText, setManualText] = useState("");
  const [speaking, setSpeaking] = useState(false);
  const sessionCreatedRef = useRef(false);

  const feedbackSSE = useSSE({
    onDone: (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.overallScore !== undefined) {
          setCurrentFeedback(parsed as FeedbackResult);
        }
      } catch {
        // Non-JSON response, ignore
      }
    },
  });

  const summarySSE = useSSE({
    onDone: (data) => {
      try {
        const parsed = JSON.parse(data);
        if (parsed.sessionScore !== undefined) {
          setSessionSummary(parsed as SessionSummary);
        }
      } catch {
        // ignore
      }
    },
  });

  const recording = useRecording();

  const startSession = useCallback(
    async (config: {
      format: InterviewFormat;
      company: string;
      numQuestions: number;
      maxFollowUps: number;
    }) => {
      try {
        const res = await fetch("/api/interview/sessions", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            company: config.company,
            role: config.format,
          }),
        });
        const sessionData = await res.json();

        const qRes = await fetch(
          `/api/interview/content?company=${config.company}&count=${config.numQuestions}`
        );
        const questions: Question[] = await qRes.json().then((d) => d.questions);

        setSession({
          id: sessionData.id,
          format: config.format,
          company: config.company,
          questions,
          currentIndex: 0,
          maxFollowUps: config.maxFollowUps,
          answers: [],
        });
        sessionCreatedRef.current = true;
        setCurrentFeedback(null);
        setManualText("");
        recording.reset();
        setPhase("interview");
      } catch (err) {
        console.error("Failed to start session:", err);
      }
    },
    [recording]
  );

  const submitAnswer = useCallback(async () => {
    if (!session) return;

    const answerText = recording.transcript || manualText.trim();
    if (!answerText) return;

    if (recording.state === "recording") {
      recording.stop();
    }

    const question = session.questions[session.currentIndex];

    setCurrentFeedback(null);
    await feedbackSSE.send("/api/interview/feedback", {
      question: question.text,
      answer: answerText,
      sessionId: session.id,
      company: session.company,
      lp: question.lp,
    });
  }, [session, recording, manualText, feedbackSSE]);

  const nextQuestion = useCallback(() => {
    if (!session) return;

    const question = session.questions[session.currentIndex];
    if (currentFeedback) {
      session.answers.push({ question, feedback: currentFeedback });
    }

    const nextIdx = session.currentIndex + 1;
    if (nextIdx >= session.questions.length) {
      setPhase("summary");
      summarySSE.send("/api/interview/feedback", {
        action: "summary",
        sessionId: session.id,
        company: session.company,
      });
      return;
    }

    setSession({ ...session, currentIndex: nextIdx });
    setCurrentFeedback(null);
    setManualText("");
    recording.reset();
    feedbackSSE.reset();
  }, [session, currentFeedback, recording, feedbackSSE, summarySSE]);

  const speakQuestion = useCallback(async () => {
    if (!session || speaking) return;
    const question = session.questions[session.currentIndex];
    setSpeaking(true);

    try {
      const res = await fetch("/api/interview/tts", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ text: question.text }),
      });

      if (res.headers.get("content-type")?.includes("audio")) {
        const audioBlob = await res.blob();
        const url = URL.createObjectURL(audioBlob);
        const audio = new Audio(url);
        audio.onended = () => {
          setSpeaking(false);
          URL.revokeObjectURL(url);
        };
        await audio.play();
      } else {
        const utterance = new SpeechSynthesisUtterance(question.text);
        utterance.onend = () => setSpeaking(false);
        speechSynthesis.speak(utterance);
      }
    } catch {
      const utterance = new SpeechSynthesisUtterance(
        session.questions[session.currentIndex].text
      );
      utterance.onend = () => setSpeaking(false);
      speechSynthesis.speak(utterance);
    }
  }, [session, speaking]);

  const newSession = useCallback(() => {
    setPhase("config");
    setSession(null);
    setCurrentFeedback(null);
    setSessionSummary(null);
    setManualText("");
    recording.reset();
    feedbackSSE.reset();
    summarySSE.reset();
  }, [recording, feedbackSSE, summarySSE]);

  return (
    <>
      <AppNav />
      <main className="flex-1 overflow-auto p-8">
        <div className="max-w-4xl mx-auto">
          <h1 className="text-3xl font-bold mb-2">Interview Practice</h1>
          <p className="text-gray-400 mb-6">
            Voice-first behavioral interview practice with AI STAR scoring
          </p>

          {phase === "config" && <InterviewConfig onStart={startSession} />}

          {phase === "interview" && session && (
            <div className="space-y-4">
              <QuestionCard
                question={session.questions[session.currentIndex]}
                index={session.currentIndex}
                total={session.questions.length}
                onSpeak={speakQuestion}
                speaking={speaking}
              />

              <RecordingPanel
                isRecording={recording.state === "recording"}
                transcript={recording.transcript}
                partialTranscript={recording.partialTranscript}
                duration={recording.duration}
                usingSpeechmatics={recording.usingSpeechmatics}
                manualText={manualText}
                onManualTextChange={setManualText}
                onStart={recording.start}
                onStop={() => recording.stop()}
                onSubmit={submitAnswer}
                hasTranscript={!!recording.transcript}
              />

              <FeedbackCard
                feedback={currentFeedback}
                state={feedbackSSE.state as AIState}
                streamTokens={feedbackSSE.tokens}
                error={feedbackSSE.error}
                onRetry={submitAnswer}
                onNext={nextQuestion}
              />
            </div>
          )}

          {phase === "summary" && (
            <SessionSummaryCard
              summary={sessionSummary}
              state={summarySSE.state as AIState}
              streamTokens={summarySSE.tokens}
              error={summarySSE.error}
              onNewSession={newSession}
              onViewHistory={() => {
                window.location.href = "/interview/history";
              }}
            />
          )}
        </div>
      </main>
    </>
  );
}
