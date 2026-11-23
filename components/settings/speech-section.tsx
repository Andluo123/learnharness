"use client";

/**
 * The speech (TTS) settings section.
 *
 * One record, seven knobs: the provider, the voice, the rate, the reading
 * language, the continuous mode, whether code is read, and — for a custom
 * endpoint — its model id and voice name.
 *
 * The section reads and writes through the speech store
 * (components/speech-preference.ts), the same way the dictation language
 * row does.
 */

import { useEffect, useRef, useState } from "react";
import {
	SPEECH_SPEED_MAX,
	SPEECH_SPEED_MIN,
	defaultSpeechVoice,
	resolveSpeechConfig,
	speechVoiceCatalog,
	type SpeechConfig,
	type SpeechLanguageStrategy,
	type SpeechProviderId,
} from "@/src/core";
import { MenuShell } from "@/components/menu-shell";
import { useInteractionLayers } from "@/components/interaction-layers";
import { Hint } from "@/components/ui/hint";
import { SettingsMenuTrigger, SettingsRow, Toggle } from "@/components/settings/controls";
import { useSpeechSettings } from "@/components/speech-preference";
import { speechController } from "@/components/speech-player";
import { useT } from "@/i18n/use-t.ts";

/** The speech settings section. */
export function SpeechSection() {
	const t = useT("settingsSpeech");
	const { config, saving, error, save } = useSpeechSettings();
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const interactions = useInteractionLayers();

	// The catalog follows the provider: Deepgram and Edge each ship their own
	// (and a custom endpoint has none — its voices are free text).
	const voices = speechVoiceCatalog(config.provider);
	const current = voices.find((voice) => voice.id === config.voice);

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const popup = interactions.getTopLayer();
			if (popup?.kind !== "popup" || popup.anchorRef?.current !== triggerRef.current || !interactions.isElementEligible(popup.rootRef.current)) return;
			const target = event.target as Element;
			if (target instanceof Element && target.closest('[data-testid="speech-voice-menu"]')) return;
			if (!triggerRef.current?.contains(target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, interactions]);

	const write = (patch: Partial<SpeechConfig>) => { void save(patch); };

	const pickVoice = async (voiceId: string) => {
		if (saving) return;
		if (await save({ voice: voiceId })) {
			setOpen(false);
			if (interactions.isElementEligible(triggerRef.current) || interactions.isPopupOrigin(triggerRef.current)) triggerRef.current?.focus();
		}
	};

	const preview = async () => {
		await speechController().speak(SPEECH_PREVIEW_SAMPLE, { label: "preview" });
	};

	return (
		<div data-testid="speech-settings">
			{error && <p role="alert" className="mb-2 text-xs text-destructive" data-testid="speech-settings-error">{error}</p>}

			<SettingsRow label={t("provider")} hint={config.provider === "edge" ? t("providerEdgeHint") : undefined} testid="row-speech-provider">
				<ProviderPicker
					value={config.provider}
					disabled={saving}
					onChange={(provider) => {
						// A voice id belongs to the catalog it came from: carrying
						// "flutter..." over to Edge would name a voice it never had.
						// Switch to the new provider's own default in the same write.
						const voice = speechVoiceCatalog(provider).some((v) => v.id === config.voice)
							? config.voice
							: defaultSpeechVoice(provider);
						write({ provider, voice });
					}}
				/>
			</SettingsRow>

			{config.provider !== "custom" ? (
				<SettingsRow label={t("voice")} hint={t("voiceHint")} testid="row-speech-voice">
					<Hint label={error ?? current?.name ?? config.voice} side="top">
						<SettingsMenuTrigger
							ref={triggerRef}
							value={current ? `${current.name} · ${current.locale}` : config.voice}
							data-testid="speech-voice"
							aria-label={`${t("voice")}: ${current?.name ?? config.voice}`}
							aria-expanded={open}
							disabled={saving}
							onClick={() => setOpen((value) => !value)}
							className="min-w-24 max-w-[65%]"
						/>
					</Hint>
					{open && <MenuShell
						anchorRef={triggerRef}
						testid="speech-voice-menu"
						onClose={(reason) => { setOpen(false); if (reason === "escape") triggerRef.current?.focus(); return "closed"; }}
						preferredSide="down"
						menuClass="flex max-h-[60vh] w-72 max-w-[calc(100vw-1rem)] flex-col overflow-y-auto rounded-xl border border-border bg-card p-1.5 text-xs shadow-xl"
					>
						{voices.map((voice) => (
							<button
								key={voice.id}
								type="button"
								data-testid={`speech-voice-${voice.id}`}
								className="flex items-center justify-between gap-2 rounded-lg px-2 py-1.5 text-left hover:bg-accent"
								onClick={() => { void pickVoice(voice.id); }}
							>
								<span>{voice.name}</span>
								<span className="text-muted-foreground">{voice.locale}</span>
							</button>
						))}
					</MenuShell>}
				</SettingsRow>
			) : (
				<>
					<SettingsRow label={t("customModel")} hint={t("customModelHint")} testid="row-speech-custom-model">
						<input
							type="text"
							defaultValue={config.customModel}
							disabled={saving}
							data-testid="speech-custom-model"
							aria-label={t("customModel")}
							className="h-7 min-w-0 max-w-[65%] rounded-sm border border-border bg-background px-2 font-ui text-xs"
							onBlur={(event) => {
								const value = event.target.value.trim();
								if (value !== config.customModel) write({ customModel: value });
							}}
						/>
					</SettingsRow>
					<SettingsRow label={t("customVoice")} hint={t("customVoiceHint")} testid="row-speech-custom-voice">
						<input
							type="text"
							defaultValue={config.customVoice}
							disabled={saving}
							data-testid="speech-custom-voice"
							aria-label={t("customVoice")}
							className="h-7 min-w-0 max-w-[65%] rounded-sm border border-border bg-background px-2 font-ui text-xs"
							onBlur={(event) => {
								const value = event.target.value.trim();
								if (value !== config.customVoice) write({ customVoice: value });
							}}
						/>
					</SettingsRow>
				</>
			)}

			<SettingsRow label={t("speed")} testid="row-speech-speed">
				<input
					type="range"
					min={SPEECH_SPEED_MIN}
					max={SPEECH_SPEED_MAX}
					step={0.05}
					value={config.speed}
					disabled={saving}
					data-testid="speech-speed"
					aria-label={t("speed")}
					className="w-32"
					onChange={(event) => write({ speed: Number(event.target.value) })}
				/>
			</SettingsRow>

			<SettingsRow label={t("language")} testid="row-speech-language">
				<LanguagePicker
					value={config.language}
					disabled={saving}
					onChange={(language) => write({ language })}
				/>
			</SettingsRow>

			<SettingsRow label={t("autoRead")} hint={t("autoReadHint")} testid="row-speech-auto-read">
				<Toggle
					checked={config.autoRead}
					label={t("autoRead")}
					onChange={(autoRead) => write({ autoRead })}
				/>
			</SettingsRow>

			<SettingsRow label={t("readCode")} hint={t("readCodeHint")} testid="row-speech-read-code">
				<Toggle
					checked={config.readCode}
					label={t("readCode")}
					onChange={(readCode) => write({ readCode })}
				/>
			</SettingsRow>

			<SettingsRow label={t("readMath")} hint={t("readMathHint")} testid="row-speech-read-math">
				<Toggle
					checked={config.readMath}
					label={t("readMath")}
					onChange={(readMath) => write({ readMath })}
				/>
			</SettingsRow>

			<SettingsRow label={t("preview")} testid="row-speech-preview">
				<button
					type="button"
					data-testid="speech-preview"
					disabled={saving}
					className="h-7 rounded-sm border border-border bg-background px-2 font-ui text-xs hover:border-muted-foreground/50"
					onClick={() => { void preview(); }}
				>
					{t("preview")}
				</button>
			</SettingsRow>
		</div>
	);
}

function ProviderPicker({ value, disabled, onChange }: {
	value: SpeechProviderId;
	disabled: boolean;
	onChange: (provider: SpeechProviderId) => void;
}) {
	const t = useT("settingsSpeech");
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const interactions = useInteractionLayers();
	const label =
		value === "custom" ? t("providerCustom") : value === "edge" ? t("providerEdge") : t("providerDeepgram");

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const popup = interactions.getTopLayer();
			if (popup?.kind !== "popup" || popup.anchorRef?.current !== triggerRef.current || !interactions.isElementEligible(popup.rootRef.current)) return;
			const target = event.target as Element;
			if (target instanceof Element && target.closest('[data-testid="speech-provider-menu"]')) return;
			if (!triggerRef.current?.contains(target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, interactions]);

	return <>
		<Hint label={label} side="top">
			<SettingsMenuTrigger
				ref={triggerRef}
				value={label}
				data-testid="speech-provider"
				aria-label={`${t("provider")}: ${label}`}
				aria-expanded={open}
				disabled={disabled}
				onClick={() => setOpen((state) => !state)}
				className="min-w-32 max-w-[65%]"
			/>
		</Hint>
		{open && <MenuShell
			anchorRef={triggerRef}
			testid="speech-provider-menu"
			onClose={(reason) => { setOpen(false); if (reason === "escape") triggerRef.current?.focus(); return "closed"; }}
			preferredSide="down"
			menuClass="flex w-64 max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-border bg-card p-1.5 text-xs shadow-xl"
		>
			{([
				["deepgram", t("providerDeepgram")],
				["custom", t("providerCustom")],
				["edge", t("providerEdge")],
			] as const).map(([id, text]) => (
				<button
					key={id}
					type="button"
					data-testid={`speech-provider-${id}`}
					className="rounded-lg px-2 py-1.5 text-left hover:bg-accent"
					onClick={() => { setOpen(false); if (id !== value) onChange(id); }}
				>
					{text}
				</button>
			))}
		</MenuShell>}
	</>;
}

function LanguagePicker({ value, disabled, onChange }: {
	value: SpeechLanguageStrategy;
	disabled: boolean;
	onChange: (language: SpeechLanguageStrategy) => void;
}) {
	const t = useT("settingsSpeech");
	const [open, setOpen] = useState(false);
	const triggerRef = useRef<HTMLButtonElement>(null);
	const interactions = useInteractionLayers();
	const options: [SpeechLanguageStrategy, string][] = [
		["auto", t("languageAuto")],
		["zh", t("languageZh")],
		["en", t("languageEn")],
	];
	const label = options.find(([code]) => code === value)?.[1] ?? options[0]![1];

	useEffect(() => {
		if (!open) return;
		const onPointerDown = (event: PointerEvent) => {
			const popup = interactions.getTopLayer();
			if (popup?.kind !== "popup" || popup.anchorRef?.current !== triggerRef.current || !interactions.isElementEligible(popup.rootRef.current)) return;
			const target = event.target as Element;
			if (target instanceof Element && target.closest('[data-testid="speech-language-menu"]')) return;
			if (!triggerRef.current?.contains(target)) setOpen(false);
		};
		document.addEventListener("pointerdown", onPointerDown);
		return () => document.removeEventListener("pointerdown", onPointerDown);
	}, [open, interactions]);

	return <>
		<Hint label={label} side="top">
			<SettingsMenuTrigger
				ref={triggerRef}
				value={label}
				data-testid="speech-language"
				aria-label={`${t("language")}: ${label}`}
				aria-expanded={open}
				disabled={disabled}
				onClick={() => setOpen((state) => !state)}
				className="min-w-24 max-w-[65%]"
			/>
		</Hint>
		{open && <MenuShell
			anchorRef={triggerRef}
			testid="speech-language-menu"
			onClose={(reason) => { setOpen(false); if (reason === "escape") triggerRef.current?.focus(); return "closed"; }}
			preferredSide="down"
			menuClass="flex w-56 max-w-[calc(100vw-1rem)] flex-col rounded-xl border border-border bg-card p-1.5 text-xs shadow-xl"
		>
			{options.map(([code, text]) => (
				<button
					key={code}
					type="button"
					data-testid={`speech-language-${code}`}
					className="rounded-lg px-2 py-1.5 text-left hover:bg-accent"
					onClick={() => { setOpen(false); if (code !== value) onChange(code); }}
				>
					{text}
				</button>
			))}
		</MenuShell>}
	</>;
}

/** The sample the preview button reads. */
export const SPEECH_PREVIEW_SAMPLE = "This is how the assistant will read your answers.";

/** The resolved configuration for a record — exported for the tests. */
export function speechConfigFor(speech: unknown): SpeechConfig {
	return resolveSpeechConfig(speech as never);
}
