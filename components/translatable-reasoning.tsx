"use client";

/** A reasoning row with an optional, click-only translation button.
 *  Reads the `translation` settings section; when disabled it renders the
 *  exact same Reasoning subtree as before (no button, no request). */

import { useEffect, useState } from "react";
import { Reasoning, ReasoningContent, ReasoningTrigger } from "@/components/ai-elements/reasoning";
import { TranslationButton, useReasoningTranslation, type TranslationConfig } from "@/components/reasoning-translation.tsx";

const EMPTY: TranslationConfig = { enabled: false, targetLanguage: "zh-CN", model: null };

/** Module-level cache of the settings record — one fetch per page, refreshed
 *  when a settings write announces itself. */
let cached: TranslationConfig = EMPTY;
let loaded = false;
const listeners = new Set<() => void>();
const publish = (next: TranslationConfig) => { cached = next; loaded = true; listeners.forEach(fn => fn()); };
function load(): void {
  if (loaded) return;
  loaded = true;
  void fetch("/api/settings").then(r => r.json()).then(body => {
    const raw = (body as { settings?: { translation?: Partial<TranslationConfig> } })?.settings?.translation;
    publish(raw ? {
      enabled: raw.enabled === true,
      targetLanguage: typeof raw.targetLanguage === "string" ? raw.targetLanguage : "zh-CN",
      model: raw.model && typeof raw.model.provider === "string" && typeof raw.model.id === "string" ? raw.model : null,
    } : EMPTY);
  }).catch(() => { publish(EMPTY); });
  if (typeof window !== "undefined") {
    window.addEventListener("lh:settings-saved", (event) => {
      if ((event as CustomEvent<{ section?: string }>).detail?.section === "translation") {
        loaded = false; load();
      }
    });
  }
}
function useTranslationConfig(): TranslationConfig {
  const [, force] = useState(0);
  useEffect(() => {
    load();
    const fn = () => force(v => v + 1);
    listeners.add(fn);
    return () => { listeners.delete(fn); };
  }, []);
  return cached;
}

export function TranslatableReasoning({ text, isStreaming, className }: { text: string; isStreaming: boolean; className?: string }) {
  const config = useTranslationConfig();
  const state = useReasoningTranslation(text, config);
  return (
    <Reasoning isStreaming={isStreaming} className={className}>
      <ReasoningTrigger />
      {config.enabled && <div className="flex justify-end px-2 pt-1"><TranslationButton state={state} /></div>}
      <ReasoningContent>{state.text}</ReasoningContent>
    </Reasoning>
  );
}
