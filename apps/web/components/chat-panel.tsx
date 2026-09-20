import { ui } from "@audit/lib/i18n";
import { Button } from "./ui/button.tsx";

export function ChatPanel() {
  return (
    <section className="flex h-full min-h-0 flex-col overflow-hidden rounded-xl border border-border bg-surface shadow-xs">
      <div className="border-b border-border p-3">
        <h2 className="text-sm font-semibold text-muted-foreground">
          {ui.askRecord}
        </h2>
      </div>
      <div className="flex min-h-0 flex-1 flex-col items-center justify-center gap-2 overflow-auto p-6 text-center">
        <p className="text-sm font-semibold text-foreground">
          {ui.chatEmptyTitle}
        </p>
        <p className="text-sm text-muted-foreground">{ui.chatEmptyBody}</p>
        <div className="mt-2 flex flex-col gap-2">
          {ui.chatSuggestions.map((suggestion) => (
            <span
              key={suggestion}
              className="rounded-lg border border-dashed border-border bg-muted/40 px-3 py-1.5 text-xs text-muted-foreground transition-colors hover:border-brand"
            >
              {suggestion}
            </span>
          ))}
        </div>
      </div>
      <div className="flex items-center gap-2 border-t border-border p-3">
        <input
          type="text"
          className="h-10 flex-1 rounded-md border border-border bg-surface px-3 text-sm text-foreground placeholder:text-muted-foreground focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
          placeholder={ui.chatPlaceholder}
          aria-label={ui.chatPlaceholder}
        />
        <Button variant="primary">{ui.chatSend}</Button>
      </div>
    </section>
  );
}
