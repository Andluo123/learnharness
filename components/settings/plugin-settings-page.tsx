"use client";

import type { FrontendPlugin } from "@/components/plugin-manager";
import { PluginMountPoint } from "@/components/plugins";
import { PluginSettingsRows } from "@/components/plugin-ui-host";
import { SettingsSection } from "./controls";
import { useT } from "@/i18n/use-t.ts";
import { pluginDisplayName } from "@/i18n/plugin-names.ts";
import { useActiveLocale } from "@/i18n/use-active-locale.ts";
import { LOCALE_LABELS, isAppLocale, type AppLocale } from "@/i18n/config.ts";

/** Plugin persistence belongs to the registration; the host only presents it. */
export function PluginSettingsPage({ plugin }: { plugin: FrontendPlugin }) {
	const activeLocale = useActiveLocale();
	const pluginT = useT("settingsPlugins");
	const t = useT("settingsPluginPage");
	const { info, settings } = plugin;
	const name = pluginDisplayName(info.id, info.manifest?.name, activeLocale, pluginT);
	return <SettingsSection title={name} testid={`section-plugin-${info.id}`}>
		{plugin.error && <p role="alert" className="break-words text-xs text-destructive">{plugin.error}</p>}
		{plugin.phase === "loading" ? <p role="status" className="text-xs text-muted-foreground">{t("loadingSettings")}</p>
			: plugin.phase === "error" ? !plugin.error && <p role="alert" className="text-xs text-destructive">{t("loadFailed")}</p>
				: !settings ? <p className="text-xs text-muted-foreground">{t("noSettings")}</p>
					: typeof settings === "function" ? <PluginMountPoint pluginId={info.id} mount={settings} label={`${name} settings`} />
						: <PluginSettingsRows schema={settings} />}
	</SettingsSection>;
}
