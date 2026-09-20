import { settings } from "@audit/lib/i18n";
import { io } from "next/cache";
import Link from "next/link";
import { SettingsForm } from "../../components/settings-form.tsx";
import { getSettingsView } from "../../lib/provider-settings.ts";
import {
  buildLlmProviderOptions,
  buildOcrProviderOptions,
  buildProviderModels,
} from "../../lib/settings-options.ts";

export const instant = false;

export default async function SettingsPage() {
  await io();
  const view = await getSettingsView();
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-8 sm:px-4">
      <div className="flex flex-col gap-1">
        <Link
          className="text-sm text-muted-foreground transition-colors hover:text-brand"
          href="/"
        >
          ← {settings.title}
        </Link>
        <h1 className="text-2xl font-semibold tracking-tight">
          {settings.title}
        </h1>
        <p className="text-sm text-muted-foreground">{settings.description}</p>
      </div>
      <SettingsForm
        initial={view}
        providerModels={buildProviderModels()}
        llmProviders={buildLlmProviderOptions()}
        ocrProviders={buildOcrProviderOptions()}
      />
    </main>
  );
}
