/**
 * Agnes AI — a built-in OpenAI-compatible provider (Agnes 3.0 Flash).
 *
 * WHY A FIRST-CLASS PROVIDER RATHER THAN THE CUSTOM ENDPOINT SLOT: the
 * custom slot holds exactly ONE user-configured endpoint and shows up as
 * "Custom endpoint" in the key list. Agnes ships with a known base URL, a
 * known model catalog (512K context / 65K output), and its own env var
 * (AGNES_API_KEY), so it belongs beside the other named providers: one row
 * in Settings → Providers, its models in every slot picker, no manual
 * base-URL entry.
 *
 * The implementation is deliberately the SAME OpenAI-completions wire the
 * custom endpoint uses — Agnes documents POST /v1/chat/completions with
 * OpenAI-shaped fields — so there is one HTTP path to audit, not two.
 */

import { createProvider, type Api, type Model, type Provider } from "@earendil-works/pi-ai";
import { openAICompletionsApi } from "@earendil-works/pi-ai/api/openai-completions.lazy";

/** The provider id pi-ai and the settings pickers use everywhere. */
export const AGNES_PROVIDER_ID = "agnes";
/** The pi-ai provider's display name (the key row's label wins for the UI). */
export const AGNES_PROVIDER_NAME = "Agnes AI";
/** The env var / auth.json key name — one name everywhere (house rule). */
export const AGNES_ENV_VAR = "AGNES_API_KEY";
/** Documented endpoint base (Chat Completions lives at <base>/chat/completions). */
export const AGNES_BASE_URL = "https://api.agnes-ai.cn/v1";

/** One catalog entry. Values are the vendor's PUBLISHED numbers
 *  (docs.agnes-ai.cn › Agnes 3.0 Flash): a 512K window, 65,536 output
 *  tokens, text + image-URL input. */
export interface AgnesModelSpec {
	id: string;
	name: string;
	/** Accepts image input (the model takes image URLs). */
	image: boolean;
	/** Accepts a reasoning/thinking budget. */
	reasoning: boolean;
	context: number;
	maxTokens: number;
}

export const AGNES_MODELS: readonly AgnesModelSpec[] = [
	{
		id: "agnes-3.0-flash",
		name: "Agnes 3.0 Flash",
		image: true,
		reasoning: true,
		context: 512_000,
		maxTokens: 65_536,
	},
];

/**
 * Agnes's OpenAI-compatibility quirks, pinned explicitly.
 *
 * pi-ai's detectCompat() decides these from a provider/base-URL allowlist.
 * Agnes is not on that list, so the defaults were used — and the endpoint
 * rejected every tool round with:
 *
 *   400 ... missing field `tool_call_id` at line 1 column 43951 ...
 *
 * The cause: pi-ai only stamps the `name` field on a role:"tool" message
 * when compat.requiresToolResultName is true, but Agnes validates against a
 * schema that REQUIRES it alongside tool_call_id.
 *
 * Model.compat is the documented override seam, so the provider states its
 * needs here instead of being inferred:
 *  - requiresToolResultName: the 400 above (the field Agnes demands)
 *  - maxTokensField "max_tokens": the endpoint documents max_tokens
 *  - supportsReasoningEffort: Agnes documents a Thinking mode
 *  - supportsStore/DeveloperRole off: plain Chat Completions, no /responses
 */
const AGNES_COMPAT = {
	requiresToolResultName: true,
	requiresAssistantAfterToolResult: false,
	requiresThinkingAsText: false,
	requiresReasoningContentOnAssistantMessages: false,
	maxTokensField: "max_tokens" as const,
	supportsReasoningEffort: true,
	supportsStore: false,
	supportsDeveloperRole: false,
	supportsUsageInStreaming: true,
	supportsFinishReason: true,
} as const;

/** Map one catalog entry to pi-ai's Model shape. */
function toPiModel(spec: AgnesModelSpec): Model<"openai-completions"> {
	return {
		id: spec.id,
		name: spec.name,
		provider: AGNES_PROVIDER_ID,
		baseUrl: AGNES_BASE_URL,
		api: "openai-completions",
		input: spec.image ? ["text", "image"] : ["text"],
		reasoning: spec.reasoning,
		cost: { input: 0, output: 0, cacheRead: 0, cacheWrite: 0 },
		contextWindow: spec.context,
		maxTokens: spec.maxTokens,
		type: "chat",
		compat: AGNES_COMPAT,
	};
}

/** The provider piModels() installs at boot. The key resolves through
 *  pi-ai's own env lookup (the auth-file seam reflects AGNES_API_KEY into
 *  the environment), so a missing key simply fails that provider's stream
 *  with "not configured" — the same late, honest failure as every
 *  built-in. */
export function createAgnesProvider(): Provider<Api> {
	return createProvider<Api>({
		id: AGNES_PROVIDER_ID,
		name: AGNES_PROVIDER_NAME,
		baseUrl: AGNES_BASE_URL,
		// The resolver reads the AMBIENT env through pi's auth context rather
		// than process.env directly: tests inject an isolated env object, and a
		// direct process.env read would bypass it (the broad resolver contract
		// in tests/provider-neutral-agents.test.ts pins exactly this).
		auth: {
			apiKey: {
				name: "Agnes AI API key",
				resolve: async ({ ctx }) => {
					// ctx.env(name) is pi's authoritative ambient-env read: it honors
					// the injected auth context (tests pass an isolated env) and falls
					// back to the process environment in production.
					const apiKey = (await ctx.env(AGNES_ENV_VAR)) ?? process.env[AGNES_ENV_VAR];
					if (!apiKey) return undefined;
					return { auth: { apiKey }, source: AGNES_ENV_VAR };
				},
			},
		},
		models: AGNES_MODELS.map(toPiModel),
		api: openAICompletionsApi(),
	});
}
