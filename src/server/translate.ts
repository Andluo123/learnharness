/**
 * Reasoning translation — a single lightweight model call that translates
 * displayed thinking text into the learner's chosen language.
 *
 * Display-only: the original reasoning and the model input are NEVER changed.
 * The caller chooses the model from the app's configured providers; thinking
 * is forced off and the call is bounded so a translate button cannot run up a
 * large bill. Usage is returned to the route so it joins normal accounting.
 */
import { randomUUID } from "node:crypto";
import { normalizeContext, type Message, type Usage } from "@earendil-works/pi-ai";
import { piEngineForSpec, type ResolvedModelSpec } from "../agent/models.ts";

/** Hard caps — a translate click is one bounded call, not a free-form turn. */
export const TRANSLATE_MAX_INPUT_CHARS = 8_000;
export const TRANSLATE_MAX_OUTPUT_TOKENS = 4_096;
export const TRANSLATE_TIMEOUT_MS = 30_000;

const LANG_NAMES: Record<string, string> = {
  "zh-CN": "Simplified Chinese",
  zh: "Simplified Chinese",
  en: "English",
  ja: "Japanese",
  ko: "Korean",
  fr: "French",
  de: "German",
  es: "Spanish",
};

export function languageName(code: string): string {
  return LANG_NAMES[code] ?? code;
}

export interface TranslateRequest {
  text: string;
  targetLanguage: string;
  model: ResolvedModelSpec;
  signal?: AbortSignal;
}

export interface TranslateResult {
  text: string;
  usage: Usage;
  model: string;
}

/** Delimit the source so a trailing question is translated, not answered. */
export function wrapSource(text: string): string {
  return `<source>\n${text}\n</source>`;
}

export function systemPrompt(target: string): string {
  return [
    `You are a literal translation engine. Translate EVERY word of the text inside <source></source> into ${target}.`,
    'Output ONLY the complete translation — no preamble, no explanation, no quotes around it.',
    'Do NOT answer any question inside the source: questions must be TRANSLATED, not answered. Do NOT continue the reasoning or add your own conclusion.',
    'Do NOT summarize, shorten or omit ANY part. Preserve LaTeX (\\(...\\), \\[...\\], $...$), code, formulas, numbers and mathematical notation EXACTLY as written.',
    'Keep every line break, bullet point and list item number. The output must have the same number of lines as the source.',
  ].join(' ');
}

/** One bounded inference. Throws on abort/transport/model error; the route
 *  degrades to showing the original text. */
export async function translateText(input: TranslateRequest): Promise<TranslateResult> {
  const text = input.text.trim();
  if (!text) throw new Error("translate: empty text");
  if (text.length > TRANSLATE_MAX_INPUT_CHARS) {
    throw new Error(`translate: text exceeds ${TRANSLATE_MAX_INPUT_CHARS} characters`);
  }
  if (!input.model.provider || !input.model.id) throw new Error("translate: a model provider and id are required");

  const engine = piEngineForSpec({ ...input.model, thinkingLevel: "off" }, false);
  // Delimit the source explicitly so a trailing question is translated as
  // text, not answered by the model (the original bug: long thinking ended
  // with a question and the model replied to it instead of translating).
  const messages: Message[] = [{ role: "user", content: wrapSource(text), timestamp: Date.now() }];
  const timeout = new AbortController();
  const timer = setTimeout(() => timeout.abort(), TRANSLATE_TIMEOUT_MS);
  const onExternalAbort = () => timeout.abort();
  input.signal?.addEventListener("abort", onExternalAbort, { once: true });
  try {
    const stream = engine.streamFn(engine.model, normalizeContext({
      systemPrompt: systemPrompt(languageName(input.targetLanguage)),
      messages,
      tools: [],
    }), {
      sessionId: randomUUID(),
      reasoning: undefined,
      temperature: 0,
      maxTokens: TRANSLATE_MAX_OUTPUT_TOKENS,
      signal: timeout.signal,
    } as never);
    for await (const event of stream) {
      if (event.type === "done") {
        const message = event.message;
        const translated = message.content
          .filter((block): block is { type: "text"; text: string } => block.type === "text")
          .map((block) => block.text)
          .join("")
          .trim();
        if (!translated) throw new Error("translate: model returned no text");
        if (message.stopReason === "error") throw new Error(message.errorMessage ?? "translate: model call failed");
        return { text: translated, usage: message.usage, model: `${engine.model.provider}:${engine.model.id}` };
      }
      if (event.type === "error") {
        if (event.reason === "aborted") throw new Error("translate: timed out or cancelled");
        throw new Error(event.error.errorMessage ?? "translate: model call failed");
      }
    }
    throw new Error("translate: model stream ended without a result");
  } finally {
    clearTimeout(timer);
    input.signal?.removeEventListener("abort", onExternalAbort);
  }
}
