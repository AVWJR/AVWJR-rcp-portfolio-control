"use client";

import { ExpertMarkdown } from "@/components/expert/expert-markdown";
import { expertBannerCopy } from "@/lib/expert/ai-enabled";
import { formatContextChip } from "@/lib/expert/period";
import type {
  ExpertBannerKind,
  ExpertChip,
  ExpertClientContext,
  ExpertMessage,
  ExpertSuggestedAction,
} from "@/lib/expert/types";
import { useEffect, useId, useRef, useState, type FormEvent, type KeyboardEvent, type RefObject } from "react";

export function ExpertPanel({
  ctx,
  messages,
  pending,
  aiEnabled,
  error,
  completenessScore,
  onClose,
  onMinimize,
  onNewChat,
  onSend,
  onAction,
  onCopy,
  banner,
  degraded,
  composer,
  setComposer,
  panelRef,
}: {
  ctx: ExpertClientContext;
  messages: ExpertMessage[];
  pending: boolean;
  aiEnabled: boolean;
  error: string | null;
  completenessScore: number | null;
  onClose: () => void;
  onMinimize: () => void;
  onNewChat: () => void;
  onSend: (text: string) => void;
  onAction: (action: ExpertSuggestedAction) => void;
  onCopy: () => void;
  banner: ExpertBannerKind;
  degraded?: boolean;
  composer: string;
  setComposer: (value: string) => void;
  panelRef: RefObject<HTMLDivElement | null>;
}) {
  const titleId = useId();
  const listRef = useRef<HTMLDivElement>(null);
  const inputRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    const node = listRef.current;
    if (node) node.scrollTop = node.scrollHeight;
  }, [messages, pending]);

  useEffect(() => {
    inputRef.current?.focus();
  }, []);

  function submit(event: FormEvent) {
    event.preventDefault();
    onSend(composer);
  }

  function onComposerKey(event: KeyboardEvent<HTMLTextAreaElement>) {
    if (event.key === "Enter" && !event.shiftKey) {
      event.preventDefault();
      onSend(composer);
    }
  }

  const shownBanner: ExpertBannerKind = aiEnabled ? banner : "offline";
  const display: "offline" | "degraded" | ExpertBannerKind = !aiEnabled
    ? "offline"
    : degraded
      ? "degraded"
      : shownBanner;
  const lastExpert = [...messages].reverse().find((m) => m.role === "expert");
  const lastChips: ExpertChip[] = lastExpert?.chips ?? [];
  const lastActions: ExpertSuggestedAction[] = lastExpert?.actions ?? [];
  const [confirmAction, setConfirmAction] = useState<ExpertSuggestedAction | null>(null);

  function handleAction(action: ExpertSuggestedAction) {
    if (action.kind === "confirm_mutation") {
      setConfirmAction(action);
      return;
    }
    onAction(action);
  }

  return (
    <div
      ref={panelRef}
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
      className="flex h-[min(640px,80vh)] w-[min(420px,calc(100vw-1.5rem))] flex-col overflow-hidden border border-cream-300 bg-cream-50 shadow-[0_18px_50px_rgba(11,31,58,0.22)] max-md:h-[min(85vh,640px)] max-md:w-full"
    >
      <header className="bg-navy-900 px-3 py-2.5 text-cream-100">
        <div className="flex items-start justify-between gap-2">
          <div>
            <p id={titleId} className="font-display text-lg tracking-wide">
              RCP Expert
            </p>
            <p
              data-testid="expert-context-chip"
              className="mt-0.5 inline-flex items-center border border-gold-500/70 px-1.5 py-0.5 text-[10px] uppercase tracking-[0.14em] text-gold-400"
            >
              {formatContextChip(ctx.entityCode, ctx.periodLabel)}
              {completenessScore !== null ? ` · ${completenessScore}` : ""}
            </p>
          </div>
          <div className="flex items-center gap-1">
            <button
              type="button"
              onClick={onNewChat}
              className="px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cream-200 hover:bg-navy-800 hover:text-gold-400"
            >
              New chat
            </button>
            <button
              type="button"
              onClick={onCopy}
              className="px-2 py-1 text-[10px] uppercase tracking-[0.12em] text-cream-200 hover:bg-navy-800 hover:text-gold-400"
            >
              Copy link
            </button>
            <button
              type="button"
              onClick={onMinimize}
              className="px-2 py-1 text-cream-200 hover:bg-navy-800 hover:text-gold-400"
              aria-label="Minimize Expert"
            >
              ▾
            </button>
            <button
              type="button"
              onClick={onClose}
              className="px-2 py-1 text-cream-200 hover:bg-navy-800 hover:text-gold-400"
              aria-label="Close Expert"
            >
              ×
            </button>
          </div>
        </div>
        <p className="mt-1 text-[11px] text-cream-200/90">{ctx.pageTitle}</p>
      </header>

      <div
        data-testid={
          display === "offline"
            ? "expert-offline-banner"
            : display === "degraded"
              ? "expert-degraded-banner"
              : "expert-live-banner"
        }
        className={
          display === "offline" || display === "degraded"
            ? "border-b border-gold-500 bg-gold-100 px-3 py-1.5 text-[11px] text-navy-900"
            : "border-b border-emerald-700 bg-emerald-50 px-3 py-1.5 text-[11px] text-emerald-900"
        }
      >
        {display === "offline"
          ? `${expertBannerCopy("offline")}. Coaching still uses live completeness and anomaly tools.`
          : display === "degraded"
            ? `${expertBannerCopy(shownBanner, { degraded: true })}. Coaching still uses live completeness and anomaly tools.`
            : `${expertBannerCopy(shownBanner)}. Streaming live replies; tools stay read-only until you confirm a write.`}
      </div>

      {error ? (
        <p
          data-testid="expert-error-strip"
          role="status"
          className="border-b border-gold-500 bg-gold-100 px-3 py-1.5 text-[12px] text-navy-900"
        >
          {error}
        </p>
      ) : null}

      <div ref={listRef} className="flex-1 space-y-3 overflow-y-auto px-3 py-3">
        {messages.map((message) => (
          <article
            key={message.id}
            data-role={message.role}
            className={
              message.role === "user"
                ? "ml-8 border border-navy-800 bg-navy-900 px-3 py-2 text-[13px] text-cream-100"
                : "mr-4 border border-cream-300 bg-white px-3 py-2 shadow-ledger"
            }
          >
            <p className="mb-1 text-[10px] uppercase tracking-[0.14em] text-gold-700">
              {message.role === "user" ? "You" : "RCP Expert"}
            </p>
            {message.role === "expert" ? (
              <ExpertMarkdown text={message.content} />
            ) : (
              <p className="whitespace-pre-wrap text-[13px] leading-5">{message.content}</p>
            )}
            {message.sources?.length ? (
              <p className="mt-2 text-[10px] uppercase tracking-[0.12em] text-ink-500">{message.sources.join(" · ")}</p>
            ) : null}
          </article>
        ))}
        {pending ? (
          <p className="text-[12px] italic text-ink-500" aria-live="polite">
            {shownBanner === "grok" && !degraded
              ? "Grok is reviewing the live books…"
              : "Expert is reviewing the live books…"}
          </p>
        ) : null}
      </div>

      {lastActions.length || lastChips.length ? (
        <div className="space-y-2 border-t border-cream-300 bg-cream-100 px-3 py-2">
          {lastActions.length ? (
            <div className="flex flex-wrap gap-1.5">
              {lastActions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  data-testid={`expert-action-${action.kind}`}
                  onClick={() => handleAction(action)}
                  className="border border-gold-500 bg-navy-900 px-2 py-1 text-[11px] text-gold-400 hover:bg-navy-800"
                >
                  {action.label}
                </button>
              ))}
            </div>
          ) : null}
          {lastChips.length ? (
            <div className="flex flex-wrap gap-1.5">
              {lastChips.map((chip) => (
                <button
                  key={chip.id}
                  type="button"
                  onClick={() => onSend(chip.prompt)}
                  className="border border-navy-700 bg-white px-2 py-1 text-[11px] text-navy-900 hover:border-gold-500 hover:bg-gold-100"
                >
                  {chip.label}
                </button>
              ))}
            </div>
          ) : null}
        </div>
      ) : null}

      {confirmAction ? (
        <div
          role="alertdialog"
          aria-label="Confirm later write"
          className="border-t border-gold-500 bg-gold-100 px-3 py-2 text-[12px] text-navy-900"
        >
          <p>
            Expert does not write the books. {confirmAction.mutation ?? confirmAction.label} — confirm on the cited
            screen.
          </p>
          <div className="mt-2 flex flex-wrap gap-2">
            <button
              type="button"
              className="border border-navy-800 bg-navy-900 px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-gold-400"
              onClick={() => {
                const action = confirmAction;
                setConfirmAction(null);
                onAction(action);
              }}
            >
              Open screen
            </button>
            <button
              type="button"
              className="border border-navy-700 bg-white px-2 py-1 text-[11px] uppercase tracking-[0.12em] text-navy-900"
              onClick={() => setConfirmAction(null)}
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      <form onSubmit={submit} className="border-t border-cream-300 bg-white px-3 py-2">
        <label htmlFor="expert-composer" className="sr-only">
          Message the Expert
        </label>
        <div className="flex items-end gap-2">
          <textarea
            id="expert-composer"
            ref={inputRef}
            rows={composer.length > 80 ? 3 : 1}
            value={composer}
            onChange={(e) => setComposer(e.target.value)}
            onKeyDown={onComposerKey}
            placeholder="Ask for a click path, missing data, or a pack…"
            className="max-h-28 min-h-[40px] flex-1 resize-none border border-cream-300 bg-cream-50 px-2 py-2 text-[13px] text-ink-900 outline-none focus:border-gold-500"
          />
          <button
            type="submit"
            disabled={pending || !composer.trim()}
            className="bg-navy-900 px-3 py-2 text-[11px] uppercase tracking-[0.14em] text-gold-400 hover:bg-navy-800 disabled:opacity-40"
          >
            Send
          </button>
        </div>
      </form>
    </div>
  );
}
