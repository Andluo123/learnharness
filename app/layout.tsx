import type { Metadata } from "next";
import { JetBrains_Mono, Source_Sans_3 } from "next/font/google";
import { connection } from "next/server";
import { getLocale, getMessages } from "next-intl/server";
import "katex/dist/katex.min.css";
import "./globals.css";
import { AppShell, SidebarProvider } from "@/components/sidebar";
import { ActivityProvider } from "@/components/activity-dock";
import { ServerEventsProvider } from "@/components/server-events";
import { AppearanceProvider } from "@/components/settings/appearance";
import UpdateBanner from "@/components/update-banner";
import { PluginsProvider } from "@/components/plugins";
import { I18nProvider } from "@/components/i18n-provider";
import { LocalizedTitle } from "@/components/localized-title";
import { readThemeBoot } from "@/src/server";
import { HTML_LANG, isAppLocale, type AppLocale } from "@/i18n/config.ts";

// Chrome = JetBrains Mono, teaching prose = Source Sans 3, titles = CMU
// Serif (the bundled lh-cmu @font-face in globals.css — no CDN).
const ui = JetBrains_Mono({ subsets: ["latin"], variable: "--font-jetbrains" });
const prose = Source_Sans_3({ subsets: ["latin"], variable: "--font-sans3" });

/** Document metadata. next-intl's getLocale()/getMessages() are NOT
 *  available in generateMetadata (they need the request config, which
 *  metadata resolution bypasses), so the static English title stays; the
 *  localized document title is applied client-side by <LocalizedTitle>. */
export const metadata: Metadata = {
	title: "Learning Harness",
	description: "A teacher agent with a memory — sessions, quizzes, and a knowledge graph of what you know.",
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
	// The theme is server-rendered — its class AND its color variables —
	// so no first frame ever shows the wrong theme. connection(): the
	// record and the theme files are per-machine disk state — without it a
	// prerendered route (settings) would bake the BUILD machine's record.
	await connection();
	const { appearance, theme, vars } = readThemeBoot();
	// The active language resolves through i18n/request.ts (the settings
	// record; NODE_ENV=test pins English). messages come from the same
	// request config, so the client catalog always matches the server's.
	const locale = await getLocale();
	const messages = await getMessages();
	const activeLocale: AppLocale = isAppLocale(locale) ? locale : "en";
	return (
		<html
			lang={HTML_LANG[activeLocale]}
			className={`${theme.mode} ${ui.variable} ${prose.variable}`}
			style={vars as React.CSSProperties}
			suppressHydrationWarning
		>
			<body className="min-h-dvh antialiased">
			{/* The notification channel rides OUTSIDE everything: sidebar, dock,
				 and pages all subscribe as the polls retire (push S3, 2026-10-02). */}
			<ServerEventsProvider>
				<PluginsProvider>
					<AppearanceProvider initialAppearance={appearance} initialTheme={theme}>
						<I18nProvider locale={activeLocale} messages={messages} timeZone="Asia/Shanghai">
					<LocalizedTitle />
							<SidebarProvider>
								<ActivityProvider>
									<AppShell>{children}</AppShell>
								</ActivityProvider>
							</SidebarProvider>
						</I18nProvider>
					</AppearanceProvider>
				</PluginsProvider>
			</ServerEventsProvider>
			{/* Auto-update banner (Wave C): fixed card, Electron-only pushes. */}
			<UpdateBanner />
		</body>
		</html>
	);
}
