/**
 * GET /api/tts/voices — the voices the picker offers.
 *
 * Deepgram's Flux catalog is static and ships in the core vocabulary. A
 * custom endpoint MAY publish its voices at {baseUrl}/audio/voices; when it
 * does not, the picker falls back to a free-text field (the voice name is
 * passed straight through to the endpoint).
 */
import { speechVoices } from "@/src/server";

export const dynamic = "force-dynamic";

export async function GET() {
	const voices = await speechVoices();
	return Response.json(voices, {
		headers: { "Cache-Control": "no-store" },
	});
}
