/** Banner color follows the last completed Expert reply — never the Gateway key alone. */

import { expertBannerCopy } from "./ai-enabled";
import type { ExpertBannerKind, ExpertMessage } from "./types";

export type ExpertBannerDisplay = "offline" | "degraded" | "connecting" | "unconfirmed" | "grok";

export function inferExpertReplyMode(
  message: Pick<ExpertMessage, "mode" | "sources"> | null | undefined,
): "ai" | "offline" | null {
  if (!message) return null;
  if (message.mode === "ai" || message.mode === "offline") return message.mode;
  const sources = (message.sources ?? []).join(" ");
  if (/\+ Grok/i.test(sources) && !/offline coach|last resort/i.test(sources)) return "ai";
  if (/offline coach|last resort/i.test(sources)) return "offline";
  return null;
}

export function lastCompletedExpert(messages: ExpertMessage[]): ExpertMessage | null {
  for (let i = messages.length - 1; i >= 0; i -= 1) {
    if (messages[i].role === "expert") return messages[i];
  }
  return null;
}

export function expertBannerState(opts: {
  keyPresent: boolean;
  pending: boolean;
  lastExpert?: Pick<ExpertMessage, "mode" | "sources" | "fallbackReason"> | null;
}): {
  display: ExpertBannerDisplay;
  liveReady: boolean;
  degraded: boolean;
  shownBanner: ExpertBannerKind;
  fallbackReason?: string;
} {
  const mode = inferExpertReplyMode(opts.lastExpert);
  const fallbackReason = opts.lastExpert?.fallbackReason?.trim() || undefined;

  if (mode === "ai") {
    return { display: "grok", liveReady: true, degraded: false, shownBanner: "grok" };
  }
  if (opts.pending) {
    return { display: "connecting", liveReady: false, degraded: false, shownBanner: "offline" };
  }
  if (mode === "offline") {
    if (opts.keyPresent) {
      return {
        display: "degraded",
        liveReady: false,
        degraded: true,
        shownBanner: "offline",
        fallbackReason,
      };
    }
    return { display: "offline", liveReady: false, degraded: false, shownBanner: "offline" };
  }
  if (!opts.keyPresent) {
    return { display: "offline", liveReady: false, degraded: false, shownBanner: "offline" };
  }
  return { display: "unconfirmed", liveReady: false, degraded: false, shownBanner: "offline" };
}

export function expertBannerLine(display: ExpertBannerDisplay, fallbackReason?: string): string {
  if (display === "offline") {
    return `${expertBannerCopy("offline")}. Coaching still uses live completeness and anomaly tools.`;
  }
  if (display === "degraded") {
    return fallbackReason || "Offline coach. Last reply was not live.";
  }
  if (display === "connecting") {
    return `${expertBannerCopy("offline", { connecting: true })}. If this fails, the offline coach stays as last resort.`;
  }
  if (display === "unconfirmed") {
    return "Grok key is set. Last reply was not live — send a message to retry.";
  }
  return `${expertBannerCopy("grok")}. Streaming live replies; tools stay read-only until you confirm a write.`;
}
