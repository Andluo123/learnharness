import { translateText, TRANSLATE_MAX_INPUT_CHARS, type ResolvedModelSpec } from "@/src/server";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

/** POST /api/translate — display-only translation of one reasoning fragment.
 *  Body: { text, targetLanguage, model: { provider, id, thinkingLevel? } }
 *  The model is chosen by the learner from the configured providers. On any
 *  failure the client keeps the original text — never a fabricated translation. */
export async function POST(request: Request) {
  let body: { text?: unknown; targetLanguage?: unknown; model?: unknown };
  try { body = await request.json(); }
  catch { return Response.json({ error: "Invalid JSON body" }, { status: 400 }); }

  const text = typeof body.text === "string" ? body.text : "";
  const targetLanguage = typeof body.targetLanguage === "string" ? body.targetLanguage.trim() : "";
  const raw = body.model as Partial<ResolvedModelSpec> | undefined;
  const provider = typeof raw?.provider === "string" ? raw.provider.trim() : "";
  const id = typeof raw?.id === "string" ? raw.id.trim() : "";

  if (!text.trim()) return Response.json({ error: "No text to translate" }, { status: 400 });
  if (text.length > TRANSLATE_MAX_INPUT_CHARS) {
    return Response.json({ error: `Text exceeds ${TRANSLATE_MAX_INPUT_CHARS} characters — split it first` }, { status: 413 });
  }
  if (!targetLanguage) return Response.json({ error: "A target language is required" }, { status: 400 });
  if (!provider || !id) return Response.json({ error: "A translation model (provider + id) is required" }, { status: 400 });

  try {
    const result = await translateText({
      text,
      targetLanguage,
      model: { provider, id, thinkingLevel: "off" },
      signal: request.signal,
    });
    return Response.json({ text: result.text, model: result.model, usage: result.usage });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const status = /timed out|cancelled|abort/i.test(message) ? 504 : 502;
    return Response.json({ error: `Translation failed: ${message}` }, { status });
  }
}
