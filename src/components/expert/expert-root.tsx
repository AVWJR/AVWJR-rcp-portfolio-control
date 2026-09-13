"use client";

import { ExpertPanel } from "@/components/expert/expert-panel";
import { readExpertContext } from "@/lib/expert/nav";
import { nextPanelState, type ExpertPanelState } from "@/lib/expert/panel-state";
import { formatContextChip } from "@/lib/expert/period";
import type { ExpertChatResponse, ExpertClientContext, ExpertMessage } from "@/lib/expert/types";
import { usePathname, useSearchParams } from "next/navigation";
import { useCallback, useEffect, useMemo, useRef, useState } from "react";

const STORAGE_PREFIX = "rcp-expert:v1:";

function storageKey(ctx: ExpertClientContext): string {
  return `${STORAGE_PREFIX}${ctx.entityCode}:${ctx.periodLabel}`;
}

function loadStored(ctx: ExpertClientContext): ExpertMessage[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(storageKey(ctx));
    if (!raw) return [];
    const parsed = JSON.parse(raw) as { messages?: ExpertMessage[] };
    return Array.isArray(parsed.messages) ? parsed.messages : [];
  } catch {
    return [];
  }
}

function persist(ctx: ExpertClientContext, messages: ExpertMessage[]) {
  try {
    window.localStorage.setItem(storageKey(ctx), JSON.stringify({ messages, updatedAt: new Date().toISOString() }));
  } catch {
    // private mode
  }
}

function focusables(root: HTMLElement): HTMLElement[] {
  return Array.from(
    root.querySelectorAll<HTMLElement>(
      'a[href], button:not([disabled]), textarea, input, select, [tabindex]:not([tabindex="-1"])',
    ),
  ).filter((el) => !el.hasAttribute("disabled") && el.tabIndex !== -1);
}

export function ExpertRoot() {
  const pathname = usePathname() ?? "/";
  const searchParams = useSearchParams();
  const ctx = useMemo(
    () => readExpertContext(pathname, new URLSearchParams(searchParams.toString())),
    [pathname, searchParams],
  );

  const [state, setState] = useState<ExpertPanelState>("closed");
  const [messages, setMessages] = useState<ExpertMessage[]>([]);
  const [pending, setPending] = useState(false);
  const [aiEnabled, setAiEnabled] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [composer, setComposer] = useState("");
  const [score, setScore] = useState<number | null>(null);
  const [hydrated, setHydrated] = useState(false);

  const fabRef = useRef<HTMLButtonElement>(null);
  const panelRef = useRef<HTMLDivElement>(null);
  const openedFor = useRef<string>("");

  useEffect(() => {
    setHydrated(true);
    setMessages(loadStored(ctx));
    if (searchParams.get("expert") === "1") {
      setState("open");
    }
    openedFor.current = "";
  }, [ctx.entityCode, ctx.periodLabel, searchParams, ctx]);

  useEffect(() => {
    if (hydrated) persist(ctx, messages);
  }, [ctx, messages, hydrated]);

  const loadOpener = useCallback(
    async (force: boolean) => {
      const key = `${ctx.entityCode}:${ctx.periodLabel}`;
      const stored = force ? [] : loadStored(ctx);
      if (!force && openedFor.current === key) return;
      openedFor.current = key;
      setPending(true);
      setError(null);
      try {
        const params = new URLSearchParams({
          entity: ctx.entityCode,
          period: ctx.periodLabel,
          pathname: ctx.pathname,
        });
        if (ctx.view) params.set("view", ctx.view);
        const res = await fetch(`/api/expert/context?${params.toString()}`);
        const data = (await res.json()) as {
          aiEnabled?: boolean;
          opener?: ExpertMessage;
          completeness?: { score?: number };
        };
        setAiEnabled(Boolean(data.aiEnabled));
        if (typeof data.completeness?.score === "number") setScore(data.completeness.score);
        if (force || stored.length === 0) {
          if (data.opener) setMessages([data.opener]);
        } else {
          setMessages(stored);
        }
      } catch {
        setError("Expert context is unavailable. The rest of the app is fine.");
      } finally {
        setPending(false);
      }
    },
    [ctx],
  );

  useEffect(() => {
    if (state === "open") {
      void loadOpener(false);
    }
  }, [state, ctx.entityCode, ctx.periodLabel, loadOpener]);

  const closePanel = useCallback(() => {
    setState("closed");
    queueMicrotask(() => fabRef.current?.focus());
  }, []);

  useEffect(() => {
    if (state !== "open") return;
    function onKey(event: KeyboardEvent) {
      if (event.key === "Escape") {
        event.preventDefault();
        closePanel();
        return;
      }
      if (event.key !== "Tab" || !panelRef.current) return;
      const nodes = focusables(panelRef.current);
      if (!nodes.length) return;
      const first = nodes[0];
      const last = nodes[nodes.length - 1];
      if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    }
    document.addEventListener("keydown", onKey);
    return () => document.removeEventListener("keydown", onKey);
  }, [state, closePanel]);

  async function send(text: string) {
    const trimmed = text.trim();
    if (!trimmed || pending) return;
    setComposer("");
    const userMsg: ExpertMessage = {
      id: `user_${Date.now()}`,
      role: "user",
      content: trimmed,
      createdAt: new Date().toISOString(),
    };
    const next = [...messages, userMsg];
    setMessages(next);
    setPending(true);
    setError(null);
    try {
      const res = await fetch("/api/expert/chat", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: next.map((m) => ({ role: m.role, content: m.content })),
          context: ctx,
        }),
      });
      const data = (await res.json()) as ExpertChatResponse & { error?: string };
      if (!res.ok) {
        setError(data.error ?? "Expert could not reply.");
        return;
      }
      setAiEnabled(data.aiEnabled);
      setMessages([...next, data.message]);
    } catch {
      setError("Expert could not reply. Try again.");
    } finally {
      setPending(false);
    }
  }

  function copyLink() {
    const last = [...messages].reverse().find((m) => m.role === "expert");
    const url = new URL(window.location.href);
    url.searchParams.set("entity", ctx.entityCode);
    url.searchParams.set("period", ctx.periodLabel);
    url.searchParams.set("expert", "1");
    const payload = `${last?.content ?? "RCP Expert"}\n\n${url.toString()}`;
    void navigator.clipboard.writeText(payload);
  }

  const expanded = state === "open";
  const fabLabel = expanded ? "Close Portfolio Control Expert" : "Open Portfolio Control Expert";

  return (
    <div className="pointer-events-none fixed bottom-[max(1rem,env(safe-area-inset-bottom))] right-[max(1rem,env(safe-area-inset-right))] z-40 flex flex-col items-end gap-2">
      {expanded ? (
        <div className="pointer-events-auto max-md:w-[calc(100vw-2rem)]">
          <ExpertPanel
            ctx={ctx}
            messages={messages}
            pending={pending}
            aiEnabled={aiEnabled}
            error={error}
            completenessScore={score}
            onClose={closePanel}
            onMinimize={() => setState("minimized")}
            onNewChat={() => {
              setMessages([]);
              persist(ctx, []);
              openedFor.current = "";
              void loadOpener(true);
            }}
            onSend={send}
            onCopy={copyLink}
            composer={composer}
            setComposer={setComposer}
            panelRef={panelRef}
          />
        </div>
      ) : null}

      <button
        ref={fabRef}
        type="button"
        data-testid="expert-fab"
        aria-label={fabLabel}
        aria-expanded={expanded}
        onClick={() => setState((s) => nextPanelState(s, "toggle"))}
        className="pointer-events-auto flex h-12 items-center gap-2 border border-gold-500 bg-navy-900 px-4 text-[12px] font-semibold uppercase tracking-[0.16em] text-gold-400 shadow-[0_10px_28px_rgba(11,31,58,0.28)] hover:bg-navy-800 focus:outline-none focus-visible:ring-2 focus-visible:ring-gold-400"
      >
        <span aria-hidden className="flex h-6 w-6 items-center justify-center border border-gold-500 text-[10px]">
          {expanded ? "×" : "EX"}
        </span>
        {expanded ? "Close" : "Expert"}
      </button>
      {state === "minimized" ? (
        <p className="pointer-events-none text-[10px] uppercase tracking-[0.14em] text-ink-500">
          {formatContextChip(ctx.entityCode, ctx.periodLabel)}
        </p>
      ) : null}
    </div>
  );
}
