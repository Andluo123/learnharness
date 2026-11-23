import test from "node:test";
import assert from "node:assert/strict";
import { speakMath, speakMathOperators } from "../src/core/speech-math.ts";
import { speechText } from "../src/core/speech-text.ts";

test("a power becomes a spoken exponent", () => {
	assert.match(speakMath("x^2", "zh"), /平方/);
	assert.match(speakMath("x^2", "en"), /squared/);
	assert.match(speakMath("x^3", "zh"), /立方/);
	assert.match(speakMath("x^3", "en"), /cubed/);
	assert.match(speakMath("x^{10}", "zh"), /的十次方/);
});

test("a fraction is read denominator first, the classroom way", () => {
	assert.match(speakMath("\\frac{2}{3}", "zh"), /三分之二/);
	assert.match(speakMath("\\frac{x+1}{x-1}", "zh"), /艾克斯减一分之艾克斯加一/);
	assert.match(speakMath("-\\frac{2}{3}", "zh"), /负三分之二/);
	assert.match(speakMath("\\frac{1}{2}", "en"), /fraction 1 over 2/);
});

test("a root reads as a root", () => {
	assert.match(speakMath("\\sqrt{x+1}", "zh"), /根号艾克斯加一/);
	assert.match(speakMath("\\sqrt{x+1}", "en"), /square root of/);
	assert.match(speakMath("\\sqrt[3]{x}", "zh"), /三次根号艾克斯/);
});

test("relations and operators have spoken names", () => {
	assert.match(speakMath("a \\le b", "zh"), /小于等于/);
	assert.match(speakMath("a \\le b", "en"), /less than or equal to/);
	assert.match(speakMath("a + b", "zh"), /加/);
	assert.match(speakMath("a + b", "en"), /plus/);
});

test("greek letters and named functions are spoken", () => {
	assert.match(speakMath("\\alpha", "zh"), /阿尔法/);
	assert.match(speakMath("\\alpha", "en"), /alpha/);
	assert.match(speakMath("\\sin x", "zh"), /正弦/);
	assert.match(speakMath("\\sin x", "en"), /sine/);
});

test("a sum reads its bounds", () => {
	const spoken = speakMath("\\sum_{i=1}^{n} i", "zh");
	assert.match(spoken, /求和/);
	assert.match(spoken, /艾/);
	assert.match(spoken, /恩/);
});

test("an unknown command is read as its own name, never dropped", () => {
	const spoken = speakMath("\\weirdthing{x}", "zh");
	assert.match(spoken, /weirdthing/);
	assert.match(spoken, /x/);
});

test("text mode keeps words together", () => {
	assert.match(speakMath("\\text{hello}", "en"), /hello/);
	assert.doesNotMatch(speakMath("\\text{hello}", "en"), /h e l l o/);
});

test("the reader speaks a formula instead of dropping it", () => {
	const md = "公式是 $x^2 + y^2$ 这样。";
	const skipped = speechText(md);
	assert.doesNotMatch(skipped, /x^2/);
	const spoken = speechText(md, { math: "read", mathLocale: "zh" });
	assert.match(spoken, /平方/);
	assert.doesNotMatch(spoken, /x\^2/);
});

test("the math locale decides the reading language", () => {
	const md = "$x^2$";
	assert.match(speechText(md, { math: "read", mathLocale: "zh" }), /平方/);
	assert.match(speechText(md, { math: "read", mathLocale: "en" }), /squared/);
});

test("unicode operators are read, not passed through", () => {
	assert.match(speakMath("a \u2264 b", "zh"), /小于等于/);
	assert.match(speakMath("a \u2265 b", "zh"), /大于等于/);
	assert.match(speakMath("a \u2260 b", "zh"), /不等于/);
	assert.match(speakMath("a \u00d7 b", "zh"), /乘以/);
	assert.match(speakMath("a \u00f7 b", "zh"), /除以/);
	assert.match(speakMath("\u221a2", "zh"), /根号/);
	assert.match(speakMath("x \u2208 R", "zh"), /属于/);
	assert.match(speakMath("A \u222a B", "zh"), /并集/);
	assert.match(speakMath("\u2205", "zh"), /空集/);
});

test("an absolute value reads as one term", () => {
	assert.match(speakMath("|x|", "zh"), /艾克斯 的绝对值/);
	assert.match(speakMath("|x - 1|", "zh"), /艾克斯减一 的绝对值/);
});

test("a binomial reads as a combination", () => {
	assert.match(speakMath("\\binom{n}{k}", "zh"), /组合数 恩 选 开/);
	assert.match(speakMath("\\binom{n}{k}", "en"), /binomial coefficient/);
});

test("accents keep a Chinese name", () => {
	assert.match(speakMath("\\hat{h}", "zh"), /带帽/);
	assert.match(speakMath("\\tilde{y}", "zh"), /带波浪/);
	assert.match(speakMath("\\bar{x}", "zh"), /带横线/);
	assert.match(speakMath("\\vec{v}", "zh"), /向量/);
});

test("a limit reads its condition", () => {
	assert.match(speakMath("\\lim_{x \\to 0} f", "zh"), /极限 当 艾克斯趋于零/);
});

test("a set builder reads \mid as such that", () => {
	assert.match(speakMath("\\left\\{ x \\mid x > 0 \\right\\}", "zh"), /使得/);
	assert.match(speakMath("a \\mid b", "zh"), /整除/);
});

test("braces follow the classroom reading", () => {
	assert.match(speakMath("\\{1, 2\\}", "zh"), /大括号/);
});

test("a floor or ceiling reads as one term", () => {
	assert.match(speakMath("\\lfloor x \\rfloor", "zh"), /艾克斯 的下取整/);
	assert.match(speakMath("\\lceil x \\rceil", "zh"), /艾克斯 的上取整/);
	assert.match(speakMath("\\lfloor x \\rfloor", "en"), /floor of x/);
});

test("a sized absolute value reads as one term", () => {
	assert.match(speakMath("\\left| x-1 \\right|", "zh"), /艾克斯减一 的绝对值/);
	assert.match(speakMath("\\left\\| x \\right\\|", "zh"), /艾克斯 的范数/);
});

test("the angle brackets are read as one pair", () => {
	assert.match(speakMath("\\langle x \\rangle", "zh"), /左尖括号艾克斯右尖括号/);
	assert.doesNotMatch(speakMath("\\left\\langle x \\right\\rangle", "zh"), /a n g l e/);
});

test("a modulus reads as one term", () => {
	assert.match(speakMath("a \\bmod b", "zh"), /诶取模 必/);
	assert.match(speakMath("a \\pmod{n}", "zh"), /模 恩/);
});

test("the remaining named symbols are read, not dropped", () => {
	assert.match(speakMath("\\nexists x", "zh"), /不存在/);
	assert.match(speakMath("\\coprod", "zh"), /不交并/);
	assert.match(speakMath("\\mathfrak{g}", "zh"), /吉/);
});

test("a signed coefficient in a quadratic reads the classroom way", () => {
	// The owner's reference reading: y 等于 负三分之二 x的平方 加 二x 减 六.
	const spoken = speakMath("y = -\\frac{2}{3}x^2 + 2x - 6", "zh").replace(/\s+/g, "");
	assert.equal(spoken, "歪等于负三分之二艾克斯的平方加二艾克斯减六");
});

test("a minus at the start of a term is a sign; after an operand it is a subtraction", () => {
	assert.match(speakMath("-2", "zh"), /^负二$/);
	assert.match(speakMath("a - 2", "zh"), /减二$/);
	assert.match(speakMath("3 - -2", "zh"), /减负二$/);
	assert.match(speakMath("\\sqrt{-1}", "zh"), /根号负一/);
	assert.match(speakMath("-2", "en"), /^negative 2$/);
});

test("a closing bracket ends the term, so the minus after it is a subtraction", () => {
	assert.match(speakMath("(x - 1) - 2", "zh"), /括号减二$/);
	assert.match(speakMath("f(x) - 1", "zh"), /括号减一$/);
	assert.match(speakMath("(x - 1)(x + 2)", "zh"), /括号括号/);
});

test("a nested fraction switches to 除以 so the structure stays audible", () => {
	// 「分之」 said twice is ambiguous: 三分之二分之一 reads the same whether the
	// inner fraction is the numerator or the denominator. Measured on the live
	// Edge voice, both produced byte-identical audio (12240 B), so the nested
	// form goes linear instead.
	assert.equal(speakMath("\\frac{\\frac{1}{2}}{3}", "zh"), "二分之一除以三");
	assert.equal(speakMath("\\frac{1}{\\frac{2}{3}}", "zh"), "一除以三分之二");
	assert.equal(speakMath("\\frac{\\frac{1}{2}}{\\frac{3}{4}}", "zh"), "二分之一除以四分之三");
});

test("a simple fraction keeps the classroom 分之 reading", () => {
	// The linear form is only for nesting; the everyday case must not change.
	assert.equal(speakMath("\\frac{2}{3}", "zh"), "三分之二");
	assert.equal(speakMath("\\frac{x+1}{x-1}", "zh", false), "x减一分之x加一");
});

test("a numerator and a denominator nested differently never read alike", () => {
	// The regression this rule exists to prevent.
	const numeratorNested = speakMath("\\frac{\\frac{1}{2}}{3}", "zh");
	const denominatorNested = speakMath("\\frac{1}{\\frac{2}{3}}", "zh");
	assert.notEqual(numeratorNested, denominatorNested);
});

test("a negative nested fraction keeps both signs audible", () => {
	assert.equal(speakMath("\\frac{\\frac{1}{2}}{-\\frac{3}{4}}", "zh"), "二分之一除以负四分之三");
	assert.equal(speakMath("\\frac{-\\frac{1}{2}}{-\\frac{3}{4}}", "zh"), "负二分之一除以负四分之三");
	assert.equal(speakMath("-\\frac{\\frac{1}{2}}{\\frac{3}{4}}", "zh"), "负二分之一除以四分之三");
});

test("a nested english fraction keeps its tree in the word order", () => {
	// English was never ambiguous: the nesting shows up in the words.
	assert.equal(speakMath("\\frac{\\frac{1}{2}}{\\frac{3}{4}}", "en"), "fraction fraction 1 over 2 over fraction 3 over 4");
});

test("a sign in the denominator moves in front of the fraction", () => {
	// The owner's rule: a negative numerator stays in place, a negative
	// denominator is spoken as a negative fraction.
	assert.equal(speakMath("\\frac{-1}{2}", "zh"), "二分之负一");
	assert.equal(speakMath("\\frac{1}{-2}", "zh"), "负二分之一");
	assert.equal(speakMath("\\frac{-1}{-2}", "zh"), "负二分之负一");
});

test("a subtraction before a bracket reads 减去", () => {
	assert.equal(speakMath("3 - (-2)", "zh"), "三减去括号负二括号");
	assert.match(speakMath("a - (b + c)", "zh"), /^诶减去括号/);
	assert.match(speakMath("3 - (-2)", "en"), /minus open parenthesis negative 2/);
	assert.match(speakMath("a - 2", "zh"), /减二$/);
});

test("a formula written WITHOUT delimiters still speaks its operators", () => {
	// The owner's report: the "=" inside ordinary prose reached the voice raw.
	assert.equal(speakMathOperators("对称轴 x = -b/2a", "zh").replace(/\s+/g, ""), "对称轴x等于负b除以2a");
	assert.match(speakMathOperators("所以 y = 2x + 1", "zh"), /等于.*加/);
	assert.match(speakMathOperators("a≠b 且 a≥0", "zh"), /不等于.*大于等于/);
	assert.match(speakMathOperators("当 x ≤ 3 且 y ≈ 2π", "zh"), /小于等于.*约等于.*派/);
	assert.match(speakMathOperators("面积 S = πr²", "zh").replace(/\s+/g, ""), /等于派r的平方/);
	assert.match(speakMathOperators("对称轴 x = -b/2a", "en"), /equals\s+negative b divided by 2a/);
});

test("a URL or a file path is never read as a formula", () => {
	assert.equal(speakMathOperators("文档在 docs/speech.md 里", "zh"), "文档在 docs/speech.md 里");
	assert.equal(speakMathOperators("见 https://example.com/a=b 这个链接", "zh"), "见 https://example.com/a=b 这个链接");
});

test("prose operators reach the speakable text through speechText", () => {
	const md = "对称轴 x = -b/2a。";
	assert.match(speechText(md, { math: "read", mathLocale: "zh" }), /等于/);
	// math: "skip" leaves the source exactly as the author wrote it.
	assert.equal(speechText(md, { math: "skip", mathLocale: "zh" }), "对称轴 x = -b/2a。");
});

test("the typographic operators a model writes are read as math", () => {
	// Fullwidth ＝ ＋ － (CJK input) and the Unicode minus U+2212 are what an
	// AI-authored formula often contains; they used to reach the voice raw.
	assert.equal(speakMath("y \uFF1D 2x", "zh"), "歪等于二艾克斯");
	assert.equal(speakMath("y \uFF1D -\\frac{2}{3}x^2", "zh"), "歪等于负三分之二艾克斯的平方");
	assert.equal(speakMath("x \u2212 1", "zh"), "艾克斯减一");
	assert.equal(speakMath("\u2212x + 3", "zh"), "负艾克斯加三");
	assert.equal(speakMath("y = 2x \uFF0B 1", "zh"), "歪等于二艾克斯加一");
	assert.equal(speakMath("2 \u2212 (\u22123)", "zh"), "二减去括号负三括号");
});
