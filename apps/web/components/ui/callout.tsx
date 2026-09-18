import type { ReactNode } from "react";
import {
  AlertCircleIcon,
  AlertTriangleIcon,
  CheckCircleIcon,
  InfoIcon,
} from "../icons.tsx";

export type CalloutTone = "info" | "success" | "warning" | "danger";

const TONES: Record<CalloutTone, { className: string; icon: typeof InfoIcon }> =
  {
    info: {
      className: "border-border bg-muted text-foreground",
      icon: InfoIcon,
    },
    success: {
      className: "border-success/30 bg-success-soft text-success",
      icon: CheckCircleIcon,
    },
    warning: {
      className: "border-warning/30 bg-warning-soft text-warning",
      icon: AlertTriangleIcon,
    },
    danger: {
      className: "border-danger/30 bg-danger-soft text-danger",
      icon: AlertCircleIcon,
    },
  };

export function Callout({
  tone = "info",
  className = "",
  children,
  ...props
}: {
  tone?: CalloutTone;
  className?: string;
  children: ReactNode;
} & { role?: "alert" | "status" }) {
  const { className: toneClass, icon: Icon } = TONES[tone];
  return (
    <div
      className={`flex items-start gap-2.5 rounded-lg border p-3 text-sm ${toneClass} ${className}`}
      {...props}
    >
      <Icon className="mt-0.5 size-4 shrink-0" />
      <div className="flex flex-col gap-1">{children}</div>
    </div>
  );
}
