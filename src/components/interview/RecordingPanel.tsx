"use client";

interface Props {
  isRecording: boolean;
  transcript: string;
  partialTranscript: string;
  duration: number;
  usingSpeechmatics: boolean;
  manualText: string;
  onManualTextChange: (text: string) => void;
  onStart: () => void;
  onStop: () => void;
  onSubmit: () => void;
  hasTranscript: boolean;
}

function formatTime(seconds: number): string {
  const m = Math.floor(seconds / 60);
  const s = seconds % 60;
  return `${m}:${s.toString().padStart(2, "0")}`;
}

export default function RecordingPanel({
  isRecording,
  transcript,
  partialTranscript,
  duration,
  usingSpeechmatics,
  manualText,
  onManualTextChange,
  onStart,
  onStop,
  onSubmit,
  hasTranscript,
}: Props) {
  const timerColor =
    duration > 180 ? "text-red-400" : duration > 120 ? "text-yellow-400" : "text-gray-400";

  return (
    <div className="bg-gray-900 border border-gray-800 rounded-xl p-5 space-y-4">
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <button
            onClick={isRecording ? onStop : onStart}
            className={`w-14 h-14 rounded-full flex items-center justify-center transition-all ${
              isRecording
                ? "bg-red-600 hover:bg-red-500 animate-pulse"
                : "bg-blue-600 hover:bg-blue-500"
            }`}
          >
            {isRecording ? (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <rect x="6" y="6" width="12" height="12" rx="1" />
              </svg>
            ) : (
              <svg className="w-6 h-6" fill="currentColor" viewBox="0 0 24 24">
                <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3z" />
                <path d="M17 11c0 2.76-2.24 5-5 5s-5-2.24-5-5H5c0 3.53 2.61 6.43 6 6.92V21h2v-3.08c3.39-.49 6-3.39 6-6.92h-2z" />
              </svg>
            )}
          </button>

          <div>
            <div className="text-sm font-medium">
              {isRecording ? "Recording..." : "Click to record"}
            </div>
            <div className="flex items-center gap-2 text-xs">
              <span className={timerColor}>{formatTime(duration)}</span>
              {isRecording && (
                <span className="text-gray-600">
                  {usingSpeechmatics ? "Speechmatics" : "Web Speech"}
                </span>
              )}
            </div>
          </div>
        </div>
      </div>

      {(transcript || partialTranscript) && (
        <div className="bg-gray-800 rounded-lg p-3 max-h-40 overflow-y-auto">
          <p className="text-sm text-gray-300">
            {transcript}
            {partialTranscript && (
              <span className="text-gray-500 italic"> {partialTranscript}</span>
            )}
          </p>
        </div>
      )}

      <div>
        <label className="text-xs text-gray-500 block mb-1">
          Or type your answer
        </label>
        <textarea
          value={manualText}
          onChange={(e) => onManualTextChange(e.target.value)}
          placeholder="Type your STAR answer here..."
          className="w-full bg-gray-800 border border-gray-700 rounded-lg px-3 py-2 text-sm min-h-[120px] focus:border-blue-500 focus:outline-none resize-none"
        />
      </div>

      <button
        onClick={onSubmit}
        disabled={!hasTranscript && !manualText.trim()}
        className="w-full py-2.5 bg-green-600 hover:bg-green-500 rounded-lg text-sm font-medium disabled:opacity-40 disabled:cursor-not-allowed transition-colors"
      >
        Submit Answer
      </button>
    </div>
  );
}
