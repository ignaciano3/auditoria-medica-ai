import type { ChatMessageRow } from "@audit/db";

export type ChatMessageView = {
  id: string;
  role: "user" | "assistant";
  content: string;
  citedPages: number[];
};

export function serializeChatMessage(row: ChatMessageRow): ChatMessageView {
  return {
    id: row.id,
    role: row.role,
    content: row.content,
    citedPages: row.citedPages,
  };
}
