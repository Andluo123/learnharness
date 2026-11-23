/**
 * POST /api/tts/speak — synthesize one piece of text.
 *
 * The renderer posts the text it wants spoken and receives the audio
 * bytes. The provider credential stays on this side: the renderer never
 * holds a TTS key (the Deepgram key or the custom endpoint's key).
 *
 * Body: { text: string, voice?: string }
 *   voice — an optional one-off voice override (a preview before the
 *   picker is saved).
 * Response: the audio bytes, with the provider's content type.
 */
import { SpeechSynthesisError, synthesizeSpeech } from "@/src/server";

export const dynamic = "force-dynamic";

export async function POST(request: Request) {
	const body = (await request.json().catch(() => null)) as { text?: unknown; voice?: unknown } | null;
	if (!body || typeof body !== "object") {
		return Response.json({ error: "Invalid JSON body" }, { status: 400 });
	}
	if (typeof body.text !== "string" || !body.text.trim()) {
		return Response.json({ error: "text must be a non-empty string" }, { status: 400 });
	}
	const voice = typeof body.voice === "string" && body.voice.trim() ? body.voice.trim() : undefined;

	try {
		const result = await synthesizeSpeech({ text: body.text, voice });
		return new Response(new Uint8Array(result.audio), {
			headers: {
				"Content-Type": result.contentType,
				"Content-Length": String(result.audio.byteLength),
				"Cache-Control": "no-store",
				"X-Content-Type-Options": "nosniff",
				"X-Speech-Provider": result.provider,
				"X-Speech-Voice": result.voice,
			},
		});
	} catch (error) {
		if (error instanceof SpeechSynthesisError) {
			return Response.json({ error: error.message }, { status: error.status });
		}
		return Response.json({ error: "Speech synthesis failed" }, { status: 500 });
	}
}
