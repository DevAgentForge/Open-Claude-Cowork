import { useEffect, useState } from "react";
import type { PermissionResult } from "@anthropic-ai/claude-agent-sdk";
import type { PermissionRequest } from "../store/useAppStore";

type AskUserQuestionInput = {
  questions?: Array<{
    question: string;
    header?: string;
    options?: Array<{ label: string; description?: string }>;
    multiSelect?: boolean;
  }>;
  answers?: Record<string, string>;
};

export function DecisionPanel({
  request,
  onSubmit
}: {
  request: PermissionRequest;
  onSubmit: (result: PermissionResult) => void;
}) {
  const input = request.input as AskUserQuestionInput | null;
  const questions = input?.questions ?? [];
  const [selectedOptions, setSelectedOptions] = useState<Record<number, string[]>>({});
  const [otherInputs, setOtherInputs] = useState<Record<number, string>>({});

  // Reset state when request changes - valid pattern for prop sync
  useEffect(() => {
    /* eslint-disable react-hooks/set-state-in-effect */
    setSelectedOptions({});
    setOtherInputs({});
    /* eslint-enable react-hooks/set-state-in-effect */
  }, [request.toolUseId]);

  const toggleOption = (qIndex: number, optionLabel: string, multiSelect?: boolean) => {
    setSelectedOptions((prev) => {
      const current = prev[qIndex] ?? [];
      if (multiSelect) {
        const next = current.includes(optionLabel)
          ? current.filter((label) => label !== optionLabel)
          : [...current, optionLabel];
        return { ...prev, [qIndex]: next };
      }
      return { ...prev, [qIndex]: [optionLabel] };
    });
  };

  const buildAnswers = () => {
    const answers: Record<string, string> = {};
    questions.forEach((q, qIndex) => {
      const selected = selectedOptions[qIndex] ?? [];
      const otherText = otherInputs[qIndex]?.trim() ?? "";
      let value = "";
      if (q.multiSelect) {
        const combined = [...selected];
        if (otherText) combined.push(otherText);
        value = combined.join(", ");
      } else {
        value = otherText || selected[0] || "";
      }
      if (value) answers[q.question] = value;
    });
    return answers;
  };

  const canSubmit = questions.every((_, qIndex) => {
    const selected = selectedOptions[qIndex] ?? [];
    const otherText = otherInputs[qIndex]?.trim() ?? "";
    return selected.length > 0 || otherText.length > 0;
  });

  if (request.toolName === "AskUserQuestion" && questions.length > 0) {
    return (
      <div className="rounded-2xl border border-accent/20 bg-accent-subtle p-5">
        <div className="text-xs font-semibold text-accent">Question from Claude</div>
        {questions.map((q, qIndex) => (
          <div key={qIndex} className="mt-4">
            <p className="text-sm text-ink-700">{q.question}</p>
            {q.header && (
              <span className="mt-2 inline-flex items-center rounded-full bg-surface px-2 py-0.5 text-xs text-muted">
                {q.header}
              </span>
            )}
            <div className="mt-3 grid gap-2">
              {(q.options ?? []).map((option, optIndex) => {
                const shouldAutoSubmit = questions.length === 1 && !q.multiSelect;
                return (
                  <button
                    key={optIndex}
                    className={`rounded-xl border px-4 py-3 text-left text-sm text-ink-700 transition-colors ${
                      (selectedOptions[qIndex] ?? []).includes(option.label)
                        ? "border-info/50 bg-info/5"
                        : "border-ink-900/10 bg-surface hover:border-info/40 hover:bg-surface-tertiary"
                    }`}
                    onClick={() => {
                      if (shouldAutoSubmit) {
                        onSubmit({
                          behavior: "allow",
                          updatedInput: { ...(input as Record<string, unknown>), answers: { [q.question]: option.label } }
                        });
                        return;
                      }
                      toggleOption(qIndex, option.label, q.multiSelect);
                    }}
                  >
                    <div className="font-medium">{option.label}</div>
                    {option.description && <div className="mt-1 text-xs text-muted">{option.description}</div>}
                  </button>
                );
              })}
            </div>
            <div className="mt-3">
              <label className="block text-xs font-medium text-muted">Other</label>
              <input
                type="text"
                className="mt-1 w-full rounded-xl border border-ink-900/10 bg-surface px-3 py-2 text-sm text-ink-700 focus:border-info/50 focus:outline-none"
                placeholder="Type your answer..."
                value={otherInputs[qIndex] ?? ""}
                onChange={(e) => setOtherInputs((prev) => ({ ...prev, [qIndex]: e.target.value }))}
              />
            </div>
            {q.multiSelect && <div className="mt-2 text-xs text-muted">Multiple selections allowed.</div>}
          </div>
        ))}
        <div className="mt-5 flex flex-wrap gap-3">
          <button
            className={`rounded-full px-5 py-2 text-sm font-medium text-white shadow-soft transition-colors ${
              canSubmit ? "bg-accent hover:bg-accent-hover" : "bg-ink-400/40 cursor-not-allowed"
            }`}
            onClick={() => {
              if (!canSubmit) return;
              onSubmit({ behavior: "allow", updatedInput: { ...(input as Record<string, unknown>), answers: buildAnswers() } });
            }}
            disabled={!canSubmit}
          >
            Submit answers
          </button>
          <button
            className="rounded-full border border-ink-900/10 bg-surface px-5 py-2 text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
            onClick={() => onSubmit({ behavior: "deny", message: "User canceled the question" })}
          >
            Cancel
          </button>
        </div>
      </div>
    );
  }

  return (
    <div className="rounded-2xl border border-accent/20 bg-accent-subtle p-5">
      <div className="text-xs font-semibold text-accent">Permission Request</div>
      <p className="mt-2 text-sm text-ink-700">
        Claude wants to use: <span className="font-medium">{request.toolName}</span>
      </p>
      <div className="mt-3 rounded-xl bg-surface-tertiary p-3">
        <pre className="text-xs text-ink-600 font-mono whitespace-pre-wrap break-words max-h-40 overflow-auto">
          {JSON.stringify(request.input, null, 2)}
        </pre>
      </div>
      <div className="mt-4 flex flex-wrap gap-3">
        <button
          className="rounded-full bg-accent px-5 py-2 text-sm font-medium text-white shadow-soft hover:bg-accent-hover transition-colors"
          onClick={() => onSubmit({ behavior: "allow", updatedInput: request.input as Record<string, unknown> })}
        >
          Allow
        </button>
        <button
          className="rounded-full border border-ink-900/10 bg-surface px-5 py-2 text-sm font-medium text-ink-700 hover:bg-surface-tertiary transition-colors"
          onClick={() => onSubmit({ behavior: "deny", message: "User denied the request" })}
        >
          Deny
        </button>
      </div>
    </div>
  );
}
