"use client";

import { errors, settings } from "@audit/lib/i18n";
import { type FormEvent, useState } from "react";
import { saveAiSettings } from "../lib/actions.ts";
import type { SettingsView } from "../lib/settings-view.ts";
import { Button } from "./ui/button.tsx";
import { Callout } from "./ui/callout.tsx";
import { Card } from "./ui/card.tsx";

type KeyField = "openai" | "deepseek" | "qwen" | "opencode";

const KEY_LABELS: Record<KeyField, string> = {
  openai: settings.keyOpenai,
  deepseek: settings.keyDeepseek,
  qwen: settings.keyQwen,
  opencode: settings.keyOpencode,
};

type SaveState =
  | { kind: "idle" }
  | { kind: "saving" }
  | { kind: "saved" }
  | { kind: "error"; message: string };

export function SettingsForm({
  initial,
  providerModels,
  llmProviders,
  ocrProviders,
}: {
  initial: SettingsView;
  providerModels: Record<string, string[]>;
  llmProviders: string[];
  ocrProviders: string[];
}) {
  const [llmProvider, setLlmProvider] = useState(initial.llmProvider);
  const [llmModel, setLlmModel] = useState(initial.llmModel);
  const [ocrProvider, setOcrProvider] = useState(initial.ocrProvider);
  const [ocrModel, setOcrModel] = useState(initial.ocrModel);
  const [keys, setKeys] = useState<Record<KeyField, string>>({
    openai: "",
    deepseek: "",
    qwen: "",
    opencode: "",
  });
  const [clearKeys, setClearKeys] = useState<KeyField[]>([]);
  const [state, setState] = useState<SaveState>({ kind: "idle" });

  const llmModels =
    llmProvider === "heuristic" ? [] : (providerModels[llmProvider] ?? []);
  const ocrModelKey = ocrProvider === "tesseract" ? "openai" : ocrProvider;
  const ocrModels =
    ocrProvider === "local" ? [] : (providerModels[ocrModelKey] ?? []);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setState({ kind: "saving" });
    try {
      const result = await saveAiSettings({
        llmProvider,
        llmModel,
        ocrProvider,
        ocrModel,
        keys,
        clearKeys,
      });
      if (!result.ok) {
        setState({ kind: "error", message: result.error });
        return;
      }
      setState({ kind: "saved" });
      setKeys({ openai: "", deepseek: "", qwen: "", opencode: "" });
      setClearKeys([]);
    } catch {
      setState({ kind: "error", message: errors.settingsSaveFailed });
    }
  }

  return (
    <form className="flex flex-col gap-4" onSubmit={submit}>
      {state.kind === "error" ? (
        <Callout tone="danger" role="alert">
          <p>{state.message}</p>
        </Callout>
      ) : null}
      {state.kind === "saved" ? (
        <Callout tone="success" role="status">
          <p>{settings.saved}</p>
        </Callout>
      ) : null}

      <Callout tone="warning">
        <p>{settings.goWarning}</p>
        <p>{settings.goRetention}</p>
      </Callout>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{settings.llmSection}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{settings.provider}</span>
          <select
            className="h-10 rounded-md border border-border bg-surface px-3"
            value={llmProvider}
            onChange={(event) => {
              const next = event.target.value;
              setLlmProvider(next);
              const models =
                next === "heuristic" ? [] : (providerModels[next] ?? []);
              setLlmModel(models[0] ?? "");
            }}
          >
            {llmProviders.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        {llmModels.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{settings.model}</span>
            <select
              className="h-10 rounded-md border border-border bg-surface px-3"
              value={llmModel}
              onChange={(event) => setLlmModel(event.target.value)}
            >
              {llmModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{settings.ocrSection}</h2>
        <label className="flex flex-col gap-1 text-sm">
          <span className="font-medium">{settings.provider}</span>
          <select
            className="h-10 rounded-md border border-border bg-surface px-3"
            value={ocrProvider}
            onChange={(event) => {
              const next = event.target.value;
              setOcrProvider(next);
              const key = next === "tesseract" ? "openai" : next;
              const models =
                next === "local" ? [] : (providerModels[key] ?? []);
              setOcrModel(models[0] ?? "");
            }}
          >
            {ocrProviders.map((provider) => (
              <option key={provider} value={provider}>
                {provider}
              </option>
            ))}
          </select>
        </label>
        {ocrModels.length > 0 ? (
          <label className="flex flex-col gap-1 text-sm">
            <span className="font-medium">{settings.model}</span>
            <select
              className="h-10 rounded-md border border-border bg-surface px-3"
              value={ocrModel}
              onChange={(event) => setOcrModel(event.target.value)}
            >
              {ocrModels.map((model) => (
                <option key={model} value={model}>
                  {model}
                </option>
              ))}
            </select>
          </label>
        ) : null}
      </Card>

      <Card className="flex flex-col gap-3 p-5">
        <h2 className="text-base font-semibold">{settings.keysSection}</h2>
        {!initial.encryptionKeyPresent ? (
          <Callout tone="danger">
            <p>{settings.noEncryptionKey}</p>
          </Callout>
        ) : null}
        {(Object.keys(KEY_LABELS) as KeyField[]).map((provider) => (
          <div key={provider} className="flex flex-col gap-1 text-sm">
            <label className="font-medium" htmlFor={`key-${provider}`}>
              {KEY_LABELS[provider]}
              {initial.configuredKeys[provider]
                ? ` · ${settings.configured}`
                : ""}
            </label>
            <input
              id={`key-${provider}`}
              className="h-10 rounded-md border border-border bg-surface px-3"
              type="password"
              autoComplete="off"
              placeholder={settings.keyPlaceholder}
              value={keys[provider]}
              onChange={(event) =>
                setKeys((prev) => ({ ...prev, [provider]: event.target.value }))
              }
            />
            {initial.configuredKeys[provider] ? (
              <label className="flex items-center gap-2 text-xs text-muted-foreground">
                <input
                  type="checkbox"
                  checked={clearKeys.includes(provider)}
                  onChange={(event) =>
                    setClearKeys((prev) =>
                      event.target.checked
                        ? [...prev, provider]
                        : prev.filter((item) => item !== provider),
                    )
                  }
                />
                {settings.clearKey}
              </label>
            ) : null}
          </div>
        ))}
      </Card>

      <Button
        type="submit"
        variant="primary"
        disabled={state.kind === "saving"}
      >
        {state.kind === "saving" ? settings.saving : settings.save}
      </Button>
    </form>
  );
}
