/**
 * THE FIRST-PAINT THEME (theme wave, 2026-11-04): what app/layout.tsx puts
 * on <html> before any client code runs — the record's appearance, the
 * active theme (a preset or an imported file; Default when the id is gone)
 * and its color variables with every override applied. Read the record
 * and only the selected custom file (the layout calls connection()
 * first, so this never bakes into a prerender).
 */

import { effectiveColors, isBuiltinThemeId, resolveTheme, themeVars, type AppearanceSettings, type Theme } from "../core";
import { themeStore } from "../store/themes.ts";
import { readSettings } from "../store/settings.ts";

/** Everything the layout needs for a flash-free first paint. */
export interface ThemeBoot {
	appearance: AppearanceSettings | undefined;
	theme: Theme;
	/** The CSS variables for <html style>. */
	vars: Record<string, string>;
}

/** Read the record and selected custom file; resolve the active theme and its vars. */
export function readThemeBoot(): ThemeBoot {
	const appearance = readSettings()?.appearance;
	const id = appearance?.theme;
	const custom = id && !isBuiltinThemeId(id) ? themeStore.readTheme(id) : null;
	const theme = resolveTheme(id, custom ? [custom] : []);
	const vars: Record<string, string> = themeVars(effectiveColors(theme, appearance), theme.mode);

	// TYPE variables ride along with the colors (theme wave follow-up). The
	// Appearance provider re-applies them on the client, but the FIRST PAINT
	// happens before it mounts: a refresh used to flash Source Sans 3 over the
	// user's chosen reading font (and 16px over their size) until hydration.
	// Emitting them here makes the server render match the record.
	const family = appearance?.fontFamily;
	if (typeof family === "string" && family.trim()) {
		vars["--font-prose"] = `"${family}", var(--font-sans3), ui-sans-serif, system-ui, sans-serif`;
	}
	if (typeof appearance?.proseFontSize === "number") {
		vars["--lh-prose-size"] = `${appearance.proseFontSize}px`;
	}
	if (appearance?.codeLigatures !== undefined) {
		vars["--lh-code-ligatures"] = appearance.codeLigatures ? "normal" : "none";
	}
	if (appearance?.sessionNameSerif === false) {
		vars["--font-title"] = "var(--font-prose)";
	}
	if (typeof appearance?.mdRendering?.headingWeight === "number") {
		vars["--lh-heading-weight"] = String(appearance.mdRendering.headingWeight);
	}

	return { appearance, theme, vars };
}
