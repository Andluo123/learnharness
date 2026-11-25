/**
 * Display-only reasoning translation: settings parser + API validation.
 * The API's model call itself is covered by the server seam contract; these
 * tests pin the guardrails (empty/oversized text, required model, error shape)
 * so a translate click can never become an unbounded model request.
 */
import assert from "node:assert/strict";
import { describe, it } from "node:test";

describe("parseTranslationSettingsBody (translation section)", () => {
  it("accepts a full section and drops unknown keys", async () => {
    const { parseTranslationSettingsBody } = await import("../src/server/settings-body.ts");
    const result = parseTranslationSettingsBody({
      enabled: true, targetLanguage: "zh-CN",
      model: { provider: "agnes", id: "agnes-3.0-flash" }, junk: 1,
    });
    assert.equal(result.ok, true);
    assert.deepEqual(result.settings, {
      enabled: true, targetLanguage: "zh-CN", model: { provider: "agnes", id: "agnes-3.0-flash" },
    });
  });

  it("rejects malformed model and non-boolean enabled", async () => {
    const { parseTranslationSettingsBody } = await import("../src/server/settings-body.ts");
    assert.equal(parseTranslationSettingsBody({ enabled: "yes" }).ok, false);
    assert.equal(parseTranslationSettingsBody({ model: { provider: "agnes" } }).ok, false);
    assert.equal(parseTranslationSettingsBody("nope").ok, false);
  });
});

describe("POST /api/translate validation", () => {
  async function post(body: unknown) {
    const { POST } = await import("../app/api/translate/route.ts");
    return POST(new Request("http://test/api/translate", {
      method: "POST", headers: { "content-type": "application/json" }, body: JSON.stringify(body),
    }));
  }
  const model = { provider: "agnes", id: "agnes-3.0-flash" };

  it("refuses empty text, missing language and missing model", async () => {
    assert.equal((await post({ text: "  ", targetLanguage: "zh-CN", model })).status, 400);
    assert.equal((await post({ text: "hello", targetLanguage: "", model })).status, 400);
    assert.equal((await post({ text: "hello", targetLanguage: "zh-CN" })).status, 400);
  });

  it("refuses oversized text before any model call", async () => {
    const res = await post({ text: "x".repeat(8001), targetLanguage: "zh-CN", model });
    assert.equal(res.status, 413);
  });

  it("refuses invalid JSON", async () => {
    const { POST } = await import("../app/api/translate/route.ts");
    const res = await POST(new Request("http://test/api/translate", {
      method: "POST", headers: { "content-type": "application/json" }, body: "not-json",
    }));
    assert.equal(res.status, 400);
  });
});

describe("translation prompt guards the whole-source contract", () => {
  it("delimits the source and forbids answering questions inside it", async () => {
    const { translationSystemPrompt, wrapTranslationSource } = await import("../src/server/index.ts");
    const source = "Step 1. ...\nLet me ask: what is the x-intercept?";
    const wrapped = wrapTranslationSource(source);
    assert.ok(wrapped.startsWith("<source>\n") && wrapped.endsWith("\n</source>"));
    assert.ok(wrapped.includes(source));
    const prompt = translationSystemPrompt("Simplified Chinese");
    assert.match(prompt, /EVERY word/);
    assert.match(prompt, /Do NOT answer any question/i);
    assert.match(prompt, /same number of lines/i);
  });
});

describe("translateText guards", () => {
  it("refuses empty and oversized input without touching a model", async () => {
    const { translateText, TRANSLATE_MAX_INPUT_CHARS } = await import("../src/server/translate.ts");
    const model = { provider: "agnes", id: "agnes-3.0-flash" };
    await assert.rejects(translateText({ text: "", targetLanguage: "zh-CN", model }), /empty text/);
    await assert.rejects(
      translateText({ text: "x".repeat(TRANSLATE_MAX_INPUT_CHARS + 1), targetLanguage: "zh-CN", model }),
      /exceeds/,
    );
    await assert.rejects(
      translateText({ text: "hi", targetLanguage: "zh-CN", model: { provider: "", id: "x" } }),
      /provider and id/,
    );
  });
});
