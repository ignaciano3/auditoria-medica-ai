"use client";

import { ui } from "@audit/lib/i18n";

export default function RouteError() {
  return (
    <main className="mx-auto flex max-w-2xl flex-col gap-6 p-4 py-8">
      <p className="text-[#d1242f]" role="alert">
        {ui.documentLoadError}
      </p>
    </main>
  );
}
