"use client";

/** Display-only reasoning translation. Clicking the button is the ONLY thing
 *  that sends a request: no automatic translation on expand, no model-input
 *  changes. Successful results are cached in memory per (text, model, lang)
 *  for the lifetime of the page — never persisted into the session record. */
import { useCallback, useEffect, useRef, useState } from "react";
import { useT } from "@/i18n/use-t.ts";
import type { AppLocale } from "@/i18n/config.ts";
import { cn } from "@/lib/utils";

export interface TranslationModel { provider: string; id: string }
export interface TranslationConfig {
  enabled: boolean;
  targetLanguage: string;
  model: TranslationModel | null;
}

/** Module-level cache. Key includes the model identity so switching models
 *  never reuses a translation from a different engine. */
const cache = new Map<string, string>();
function keyOf(text: string, model: TranslationModel, lang: string): string {
  return `${model.provider}:${model.id}|${lang}|${text}`;
}

export interface ReasoningTranslationState {
  /** Text to display — the translation while active, otherwise the source. */
  text: string;
  translated: boolean;
  busy: boolean;
  error: string | null;
  translate: () => void;
  toggle: () => void;
}

/** One translatable reasoning block. Only call translate() on an explicit
 *  click; render toggles between cached translation and the original. */
export function useReasoningTranslation(
  source: string,
  config: TranslationConfig,
): ReasoningTranslationState {
  const [active, setActive] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [version, setVersion] = useState(0);
  const alive = useRef(true);
  useEffect(() => { alive.current = true; return () => { alive.current = false; }; }, []);

  // Invalidate a stale translation when model/language/text changes.
  const key = config.model ? keyOf(source, config.model, config.targetLanguage) : "";
  const lastKey = useRef(key);
  useEffect(() => {
    if (lastKey.current !== key) {
      lastKey.current = key;
      setActive(false); setError(null);
    }
  }, [key]);

  const cached = config.model ? cache.get(key) : undefined;
  const hasTranslation = Boolean(cached);

  const translate = useCallback(() => {
    if (!config.enabled || !config.model || busy) return;
    if (cached) { setActive(true); setError(null); return; }
    setBusy(true); setError(null);
    void fetch("/api/translate", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: source, targetLanguage: config.targetLanguage, model: config.model }),
    })
      .then(async (res) => {
        const body = await res.json() as { text?: string; error?: string };
        if (!res.ok || typeof body.text !== "string") throw new Error(body.error ?? "Translation failed");
        cache.set(key, body.text);
        if (alive.current) { setActive(true); setVersion(v => v + 1); }
      })
      .catch((err: unknown) => {
        if (alive.current) setError(err instanceof Error ? err.message : String(err));
      })
      .finally(() => { if (alive.current) setBusy(false); });
  }, [config.enabled, config.model, config.targetLanguage, source, key, cached, busy]);

  // Re-read the cache after the version bump (setState above does not re-render the map read).
  void version;
  const translation = config.model ? cache.get(key) : undefined;
  return {
    text: active && translation ? translation : source,
    translated: active && Boolean(translation),
    busy,
    error,
    translate,
    toggle: () => { if (translation) setActive(v => !v); },
  };
}

export function TranslationButton({ state }: { state: ReasoningTranslationState }) {
  const t = useT("chat");
  return (
    <span className="inline-flex items-center gap-1">
      {!state.translated ? (
        <button type="button" className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          disabled={state.busy} onClick={state.translate} aria-label={t("translateThinking")}>
          {state.busy ? t("translating") : t("translateThinking")}
        </button>
      ) : (
        <button type="button" className="rounded border border-border px-1.5 py-0.5 text-[10px] text-muted-foreground hover:text-foreground"
          onClick={state.toggle} aria-label={t("viewOriginalThinking")}>
          {t("viewOriginalThinking")}
        </button>
      )}
      {state.error && <span className="text-[10px] text-destructive" role="alert">{state.error}</span>}
    </span>
  );
}
