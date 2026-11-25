"use client";

/** Display-only reasoning translation settings: master switch, target
 *  language and the model used for translation (chosen from configured
 *  providers). Reads/writes the `translation` settings section. */

import { useCallback, useEffect, useState } from "react";
import { useT } from "@/i18n/use-t.ts";
import { LOCALES } from "@/i18n/config.ts";
import { SettingsRow, Toggle } from "./controls.tsx";
import type { TranslationConfig, TranslationModel } from "@/components/reasoning-translation.tsx";

const DEFAULT_CONFIG: TranslationConfig = { enabled: false, targetLanguage: "zh-CN", model: null };

export function TranslationSection() {
  const t = useT("settingsTranslation");
  const [config, setConfig] = useState<TranslationConfig>(DEFAULT_CONFIG);
  const [models, setModels] = useState<{ provider: string; id: string; name: string }[]>([]);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let alive = true;
    void Promise.all([
      fetch("/api/settings").then(r => r.json()).catch(() => ({})),
      fetch("/api/models").then(r => r.json()).catch(() => ({ models: [] })),
    ]).then(([settings, catalog]) => {
      if (!alive) return;
      const raw = (settings as { settings?: { translation?: Partial<TranslationConfig> } })?.settings?.translation;
      if (raw) setConfig({
        enabled: raw.enabled === true,
        targetLanguage: typeof raw.targetLanguage === "string" ? raw.targetLanguage : "zh-CN",
        model: raw.model && typeof raw.model.provider === "string" && typeof raw.model.id === "string" ? raw.model : null,
      });
      const list = (catalog as { models?: { provider: string; id: string; name: string }[] })?.models ?? [];
      setModels(list.map(m => ({ provider: m.provider, id: m.id, name: m.name || m.id })));
    });
    return () => { alive = false; };
  }, []);

  const save = useCallback((next: TranslationConfig) => {
    setConfig(next); setError(null);
    void fetch("/api/settings/translation", {
      method: "PUT", headers: { "content-type": "application/json" }, body: JSON.stringify(next),
    }).then(r => { if (!r.ok) throw new Error(); }).catch(() => setError(t("saveError")));
  }, [t]);

  const modelKey = config.model ? `${config.model.provider}|${config.model.id}` : "";
  return (
    <div data-testid="translation-settings">
      {error && <p role="alert" className="mb-2 text-xs text-destructive">{error}</p>}
      <SettingsRow label={t("enable")} hint={t("enableHint")} testid="row-translation-enabled">
        <Toggle checked={config.enabled} onChange={(enabled) => save({ ...config, enabled })} label={t("enable")} />
      </SettingsRow>
      <SettingsRow label={t("language")} testid="row-translation-language">
        <select className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={config.targetLanguage} onChange={(e) => save({ ...config, targetLanguage: e.target.value })}>
          {LOCALES.map(locale => <option key={locale} value={locale}>{locale}</option>)}
        </select>
      </SettingsRow>
      <SettingsRow label={t("model")} hint={t("modelHint")} testid="row-translation-model">
        <select className="rounded border border-border bg-background px-2 py-1 text-sm"
          value={modelKey} onChange={(e) => {
            const [provider, id] = e.target.value.split("|");
            const model: TranslationModel | null = provider && id ? { provider, id } : null;
            save({ ...config, model });
          }}>
          <option value="">—</option>
          {models.map(m => <option key={`${m.provider}|${m.id}`} value={`${m.provider}|${m.id}`}>{m.name}</option>)}
        </select>
      </SettingsRow>
    </div>
  );
}
