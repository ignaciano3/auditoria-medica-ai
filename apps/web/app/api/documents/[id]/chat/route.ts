import { createLlmProvider } from "@audit/ai";
import { getEnv, ui } from "@audit/lib";
import { NextResponse } from "next/server";
import {
  type ChatDeps,
  MAX_QUESTION_LENGTH,
  prepareChat,
  streamReply,
} from "../../../../../lib/chat-service.ts";
import { getContainer } from "../../../../../lib/container.ts";
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
    provider: createLlmProvider(getEnv()),
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

  const encoder = new TextEncoder();
  let cancelled = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const send = (payload: unknown) => {
        if (cancelled) return;
        controller.enqueue(
          encoder.encode(`data: ${JSON.stringify(payload)}\n\n`),
        );
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

  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}
