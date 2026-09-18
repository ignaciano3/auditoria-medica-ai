"use client";

import { ui } from "@audit/lib/i18n";
import { Callout } from "../../../components/ui/callout.tsx";

export default function RouteError() {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-col gap-6 px-3 py-8 sm:px-4">
      <Callout tone="danger" role="alert">
        <p>{ui.documentLoadError}</p>
      </Callout>
    </main>
  );
}
