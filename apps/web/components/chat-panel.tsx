"use client";

import { ui } from "@audit/lib/i18n";
import { useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { applyPageTranscriptionCorrection } from "../lib/actions.ts";
import { renderChatContent } from "../lib/chat-markdown.tsx";
import type { ChatMessageView } from "../lib/serialize-chat-message.ts";
import {
  TranscriptionEditCard,
  type TranscriptionEditView,
} from "./transcription-edit-card.tsx";
import { Button } from "./ui/button.tsx";

type StreamPayload =
  | { delta: string }
  | { done: true; message: ChatMessageView }
  | { proposal: TranscriptionEditView }
  | { message: ChatMessageView }
  | { error: string };

export function ChatPanel({
  documentId,
  initialMessages,
  ready,
}: {
  documentId: string;
  initialMessages: ChatMessageView[];
  ready: boolean;
}) {
  const [messages, setMessages] = useState<ChatMessageView[]>(initialMessages);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const router = useRouter();
  const [proposal, setProposal] = useState<TranscriptionEditView | null>(null);
  const [applying, setApplying] = useState(false);
  const [editError, setEditError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);

  // biome-ignore lint/correctness/useExhaustiveDependencies: scroll to the newest message whenever the thread changes
  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages]);

  const submit = useCallback(
    async (question: string) => {
      const trimmed = question.trim();
      if (trimmed.length === 0 || sending) return;
      setError(null);
      setEditError(null);
      setProposal(null);
      setSending(true);
      setInput("");
      const userMessage: ChatMessageView = {
        id: `local-user-${Date.now()}`,
        role: "user",
        content: trimmed,
        citedPages: [],
      };
      const assistantId = `local-assistant-${Date.now()}`;
      setMessages((prev) => [
        ...prev,
        userMessage,
        { id: assistantId, role: "assistant", content: "", citedPages: [] },
      ]);

      try {
        const response = await fetch(`/api/documents/${documentId}/chat`, {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ message: trimmed }),
        });
        if (!response.ok || !response.body) throw new Error(ui.chatError);

        const reader = response.body.getReader();
        const decoder = new TextDecoder();
        let buffer = "";
        let settled = false;
        while (true) {
          const { value, done } = await reader.read();
          if (done) break;
          buffer += decoder.decode(value, { stream: true });
          const events = buffer.split("\n\n");
          buffer = events.pop() ?? "";
          for (const event of events) {
            const line = event.trim();
            if (!line.startsWith("data:")) continue;
            const payload = JSON.parse(line.slice(5).trim()) as StreamPayload;
            if ("delta" in payload) {
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId
                    ? { ...message, content: message.content + payload.delta }
                    : message,
                ),
              );
            } else if ("proposal" in payload) {
              settled = true;
              setMessages((prev) => prev.filter((m) => m.id !== assistantId));
              setProposal(payload.proposal);
            } else if ("done" in payload) {
              settled = true;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId ? payload.message : message,
                ),
              );
            } else if ("message" in payload) {
              settled = true;
              setMessages((prev) =>
                prev.map((message) =>
                  message.id === assistantId ? payload.message : message,
                ),
              );
            } else if ("error" in payload) {
              throw new Error(payload.error);
            }
          }
        }
        if (!settled) throw new Error(ui.chatError);
      } catch {
        setError(ui.chatError);
        setMessages((prev) => prev.filter((m) => m.id !== assistantId));
      } finally {
        setSending(false);
      }
    },
    [documentId, sending],
  );

  const confirmEdit = useCallback(async () => {
    if (proposal === null || applying) return;
    setApplying(true);
    setEditError(null);
    try {
      const result = await applyPageTranscriptionCorrection({
        documentId,
        pageNumber: proposal.pageNumber,
        incorrect: proposal.incorrect,
        correct: proposal.correct,
      });
      if (!result.ok) {
        setEditError(result.error);
        return;
      }
      setMessages((prev) => [
        ...prev,
        {
          id: `local-applied-${Date.now()}`,
          role: "assistant",
          content: ui.editApplied,
          citedPages: [],
        },
      ]);
      setProposal(null);
      router.refresh();
    } catch {
      setEditError(ui.editFailed);
    } finally {
      setApplying(false);
    }
  }, [proposal, applying, documentId, router]);

  const cancelEdit = useCallback(() => {
    if (applying) return;
    setProposal(null);
    setEditError(null);
    setMessages((prev) => [
      ...prev,
      {
        id: `local-cancelled-${Date.now()}`,
        role: "assistant",
        content: ui.editCancelled,
        citedPages: [],
      },
    ]);
  }, [applying]);

  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {ui.askRecord}
        </h2>
      </div>
      <div
        ref={scrollRef}
        className="flex min-h-0 flex-1 flex-col gap-3 overflow-auto p-4"
      >
        {messages.length === 0 ? (
          <div className="flex flex-1 flex-col items-center justify-center gap-2 p-2 text-center">
            <p className="text-sm font-semibold text-foreground">
              {ui.chatEmptyTitle}
            </p>
            <p className="text-sm text-muted-foreground">{ui.chatEmptyBody}</p>
            <div className="mt-2 flex flex-col gap-2">
              {ui.chatSuggestions.map((suggestion) => (
                <button
                  key={suggestion}
                  type="button"
                  disabled={!ready || sending}
                  onClick={() => void submit(suggestion)}
                  className="cursor-pointer rounded-lg border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand disabled:cursor-not-allowed disabled:opacity-50"
                >
                  {suggestion}
                </button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((message) => (
            <ChatBubble
              key={message.id}
              documentId={documentId}
              message={message}
            />
          ))
        )}
        {proposal !== null ? (
          <TranscriptionEditCard
            proposal={proposal}
            applying={applying}
            error={editError}
            onConfirm={() => void confirmEdit()}
            onCancel={cancelEdit}
          />
        ) : null}
        {sending ? (
          <p className="text-xs text-muted-foreground">{ui.chatThinking}</p>
        ) : null}
        {error !== null ? (
          <p role="alert" className="text-xs text-danger">
            {error}
          </p>
        ) : null}
      </div>
      <form
        className="flex items-center gap-2 border-t border-border p-3"
        onSubmit={(event) => {
          event.preventDefault();
          void submit(input);
        }}
      >
        <input
          type="text"
          value={input}
          onChange={(event) => setInput(event.target.value)}
          disabled={!ready || sending}
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand disabled:opacity-50"
          placeholder={ready ? ui.chatPlaceholder : ui.chatNotReady}
          aria-label={ui.chatPlaceholder}
        />
        <Button
          type="submit"
          variant="primary"
          disabled={!ready || sending || input.trim().length === 0}
        >
          {ui.chatSend}
        </Button>
      </form>
    </section>
  );
}

function ChatBubble({
  documentId,
  message,
}: {
  documentId: string;
  message: ChatMessageView;
}) {
  const isUser = message.role === "user";
  return (
    <div className={isUser ? "flex justify-end" : "flex justify-start"}>
      <div
        className={
          isUser
            ? "max-w-[85%] rounded-lg bg-brand px-3 py-2 text-sm text-brand-foreground"
            : "max-w-[85%] whitespace-pre-wrap rounded-lg border border-border bg-muted/40 px-3 py-2 text-sm text-foreground"
        }
      >
        {isUser ? (
          message.content
        ) : (
          <AssistantContent documentId={documentId} message={message} />
        )}
      </div>
    </div>
  );
}

function AssistantContent({
  documentId,
  message,
}: {
  documentId: string;
  message: ChatMessageView;
}) {
  return (
    <div className="space-y-2">
      {renderChatContent({
        documentId,
        content: message.content,
        citedPages: message.citedPages,
      })}
    </div>
  );
}
