import { getEnv } from "@audit/lib";
import { getContainer } from "./container.ts";
import { describeSettingsView, type SettingsView } from "./settings-view.ts";

export async function getSettingsView(): Promise<SettingsView> {
  const env = getEnv();
  const stored = await getContainer().appSettings.get();
  return describeSettingsView(stored, env);
}
