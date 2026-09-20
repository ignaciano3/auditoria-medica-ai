import type { ChatContext, ChatIntent } from "@audit/ai";
import { createLlmProvider } from "@audit/ai";
import type { DocumentPage } from "@audit/domain";
import { ui } from "@audit/lib";
import { NextResponse } from "next/server";
import {
  type ChatDeps,
  classifyIntent,
  MAX_QUESTION_LENGTH,
  planChatOutcome,
  prepareChat,
  streamReply,
} from "../../../../../lib/chat-service.ts";
import { getContainer } from "../../../../../lib/container.ts";
import { loadProviderSettings } from "../../../../../lib/provider-settings.ts";
import { serializeChatMessage } from "../../../../../lib/serialize-chat-message.ts";

export function parseChatBody(body: unknown): string | null {
  if (body === null || typeof body !== "object") return null;
  const message = (body as { message?: unknown }).message;
  if (typeof message !== "string") return null;
  const question = message.trim();
  if (question.length === 0 || question.length > MAX_QUESTION_LENGTH) {
    return null;
  }
  return question;
}

function sseResponse(stream: ReadableStream<Uint8Array>): Response {
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

export async function createOutcomeResponse(
  deps: ChatDeps,
  documentId: string,
  prepared: { context: ChatContext; pages: DocumentPage[] },
  intent: ChatIntent,
): Promise<Response> {
  const outcome = planChatOutcome(prepared.pages, intent);
  const encoder = new TextEncoder();
  const frame = (payload: unknown) => `data: ${JSON.stringify(payload)}\n\n`;

  if (outcome.kind === "message") {
    const message = await deps.chatMessages.add({
      documentId,
      role: "assistant",
      content: outcome.content,
      citedPages: [],
    });
    return sseResponse(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(frame({ message: serializeChatMessage(message) })),
          );
          controller.close();
        },
      }),
    );
  }

  if (outcome.kind === "proposal") {
    return sseResponse(
      new ReadableStream<Uint8Array>({
        start(controller) {
          controller.enqueue(
            encoder.encode(frame({ proposal: outcome.proposal })),
          );
          controller.close();
        },
      }),
    );
  }

  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (cancelled) return;
        controller.enqueue(encoder.encode(frame(payload)));
      };
      try {
        const iterator = streamReply(deps, prepared.context);
        while (true) {
          const { value, done } = await iterator.next();
          if (cancelled) break;
          if (done) {
            send({ done: true, message: serializeChatMessage(value) });
            break;
          }
          send({ delta: value });
        }
      } catch {
        send({ error: ui.chatError });
      } finally {
        if (!cancelled) {
          try {
            controller.close();
          } catch {}
        }
      }
    },
    cancel() {
      cancelled = true;
    },
  });

  return sseResponse(stream);
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return NextResponse.json({ error: ui.chatInvalid }, { status: 400 });
  }
  const question = parseChatBody(body);
  if (question === null) {
    return NextResponse.json({ error: ui.chatInvalid }, { status: 400 });
  }

  const container = getContainer();
  const deps: ChatDeps = {
    documents: container.documents,
    pages: container.pages,
    clinicalRecords: container.clinicalRecords,
    chatMessages: container.chatMessages,
    provider: createLlmProvider(await loadProviderSettings()),
  };

  const prepared = await prepareChat(deps, { documentId: id, question });
  if (!prepared.ok) {
    const status =
      prepared.error.code === "notFound"
        ? 404
        : prepared.error.code === "notReady"
          ? 409
          : 400;
    return NextResponse.json({ error: prepared.error.message }, { status });
  }

  const intent = await classifyIntent(deps, prepared.context);
  return createOutcomeResponse(deps, id, prepared, intent);
}
