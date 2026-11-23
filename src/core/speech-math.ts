/**
 * SPEECH MATH (TTS, 2026-11-20) — LaTeX → spoken text.
 *
 * WHY this exists: the reader used to DROP every formula, so a lesson's
 * most important line was silently missing from the audio. Now a formula
 * is read out loud.
 *
 * The rule of this module: BEST EFFORT, NEVER LOSSY, NEVER INVENTED. A
 * command this module does not know is read as its own name ("\\alpha" →
 * "阿尔法" / "alpha"), and a structure it cannot parse falls back to the
 * source text. A plainly-read formula beats a mangled one.
 *
 * The reading language follows the READING language of the session (zh or
 * en) — the same choice the number expansion makes (speech-numbers.ts).
 */

import { zhDecimal, zhInteger } from "./speech-numbers.ts";

/** The language the formula is read in. */
export type SpeechMathLocale = "zh" | "en";

/** A spoken atom: its base plus an optional upper and lower script. */
interface Atom {
	/** The spoken form of the base. */
	text: string;
	/** The spoken form of the upper script (x^2 → "平方"). */
	sup?: string;
	/** The spoken form of the lower script (x_i → "下标 i"). */
	sub?: string;
}

/** Greek letters. */
const GREEK: Record<string, { zh: string; en: string }> = {
	alpha: { zh: "阿尔法", en: "alpha" },
	beta: { zh: "贝塔", en: "beta" },
	gamma: { zh: "伽马", en: "gamma" },
	delta: { zh: "德尔塔", en: "delta" },
	epsilon: { zh: "艾普西龙", en: "epsilon" },
	varepsilon: { zh: "艾普西龙", en: "varepsilon" },
	zeta: { zh: "泽塔", en: "zeta" },
	eta: { zh: "伊塔", en: "eta" },
	theta: { zh: "西塔", en: "theta" },
	vartheta: { zh: "西塔", en: "vartheta" },
	iota: { zh: "约塔", en: "iota" },
	kappa: { zh: "卡帕", en: "kappa" },
	lambda: { zh: "拉姆达", en: "lambda" },
	mu: { zh: "缪", en: "mu" },
	nu: { zh: "纽", en: "nu" },
	xi: { zh: "克西", en: "xi" },
	pi: { zh: "派", en: "pi" },
	varpi: { zh: "派", en: "varpi" },
	rho: { zh: "柔", en: "rho" },
	varrho: { zh: "柔", en: "varrho" },
	sigma: { zh: "西格马", en: "sigma" },
	varsigma: { zh: "西格马", en: "varsigma" },
	tau: { zh: "陶", en: "tau" },
	upsilon: { zh: "宇普西龙", en: "upsilon" },
	phi: { zh: "斐", en: "phi" },
	varphi: { zh: "斐", en: "varphi" },
	chi: { zh: "希", en: "chi" },
	psi: { zh: "普西", en: "psi" },
	omega: { zh: "欧米伽", en: "omega" },
	Gamma: { zh: "大伽马", en: "big gamma" },
	Delta: { zh: "大德尔塔", en: "big delta" },
	Theta: { zh: "大西塔", en: "big theta" },
	Lambda: { zh: "大拉姆达", en: "big lambda" },
	Xi: { zh: "大克西", en: "big xi" },
	Pi: { zh: "大派", en: "big pi" },
	Sigma: { zh: "大西格马", en: "big sigma" },
	Upsilon: { zh: "大宇普西龙", en: "big upsilon" },
	Phi: { zh: "大斐", en: "big phi" },
	Psi: { zh: "大普西", en: "big psi" },
	Omega: { zh: "大欧米伽", en: "big omega" },
};

/** The named functions. */
const FUNCTIONS: Record<string, { zh: string; en: string }> = {
	sin: { zh: "正弦", en: "sine" },
	cos: { zh: "余弦", en: "cosine" },
	tan: { zh: "正切", en: "tangent" },
	cot: { zh: "余切", en: "cotangent" },
	sec: { zh: "正割", en: "secant" },
	csc: { zh: "余割", en: "cosecant" },
	arcsin: { zh: "反正弦", en: "arc sine" },
	arccos: { zh: "反余弦", en: "arc cosine" },
	arctan: { zh: "反正切", en: "arc tangent" },
	sinh: { zh: "双曲正弦", en: "hyperbolic sine" },
	cosh: { zh: "双曲余弦", en: "hyperbolic cosine" },
	tanh: { zh: "双曲正切", en: "hyperbolic tangent" },
	log: { zh: "对数", en: "log" },
	ln: { zh: "自然对数", en: "natural log" },
	lg: { zh: "常用对数", en: "log base ten" },
	exp: { zh: "指数", en: "exponential" },
	lim: { zh: "极限", en: "limit" },
	max: { zh: "最大值", en: "maximum" },
	min: { zh: "最小值", en: "minimum" },
	sup: { zh: "上确界", en: "supremum" },
	inf: { zh: "下确界", en: "infimum" },
	det: { zh: "行列式", en: "determinant" },
	dim: { zh: "维数", en: "dimension" },
	gcd: { zh: "最大公约数", en: "greatest common divisor" },
	deg: { zh: "度", en: "degrees" },
	ker: { zh: "核", en: "kernel" },
	arg: { zh: "辐角", en: "argument" },
};

/** Relations and set operators. */
const RELATIONS: Record<string, { zh: string; en: string }> = {
	"=": { zh: "等于", en: "equals" },
	neq: { zh: "不等于", en: "not equals" },
	ne: { zh: "不等于", en: "not equals" },
	lt: { zh: "小于", en: "less than" },
	gt: { zh: "大于", en: "greater than" },
	le: { zh: "小于等于", en: "less than or equal to" },
	leq: { zh: "小于等于", en: "less than or equal to" },
	ge: { zh: "大于等于", en: "greater than or equal to" },
	geq: { zh: "大于等于", en: "greater than or equal to" },
	approx: { zh: "约等于", en: "approximately equals" },
	sim: { zh: "近似于", en: "is similar to" },
	equiv: { zh: "恒等于", en: "is equivalent to" },
	propto: { zh: "正比于", en: "is proportional to" },
	in: { zh: "属于", en: "is in" },
	notin: { zh: "不属于", en: "is not in" },
	subset: { zh: "真包含于", en: "is a proper subset of" },
	subseteq: { zh: "包含于", en: "is a subset of" },
	supset: { zh: "真包含", en: "is a proper superset of" },
	supseteq: { zh: "包含", en: "is a superset of" },
	cup: { zh: "并集", en: "union" },
	cap: { zh: "交集", en: "intersection" },
	setminus: { zh: "除去", en: "set minus" },
	to: { zh: "趋于", en: "tends to" },
	rightarrow: { zh: "趋于", en: "tends to" },
	longrightarrow: { zh: "趋于", en: "tends to" },
	Rightarrow: { zh: "推出", en: "implies" },
	implies: { zh: "推出", en: "implies" },
	leftarrow: { zh: "左箭头", en: "left arrow" },
	gets: { zh: "左箭头", en: "left arrow" },
	iff: { zh: "当且仅当", en: "if and only if" },
	Leftrightarrow: { zh: "当且仅当", en: "if and only if" },
	forall: { zh: "对任意", en: "for all" },
	exists: { zh: "存在", en: "there exists" },
	neg: { zh: "非", en: "not" },
	lnot: { zh: "非", en: "not" },
	land: { zh: "并且", en: "and" },
	lor: { zh: "或者", en: "or" },
	perp: { zh: "垂直于", en: "is perpendicular to" },
	parallel: { zh: "平行于", en: "is parallel to" },
	circ: { zh: "复合", en: "composed with" },
	degree: { zh: "度", en: "degrees" },
	prime: { zh: "撇", en: "prime" },
	infty: { zh: "无穷大", en: "infinity" },
	partial: { zh: "偏导", en: "partial" },
	nabla: { zh: "梯度", en: "gradient" },
	ldots: { zh: "等等", en: "dot dot dot" },
	dots: { zh: "等等", en: "dot dot dot" },
	cdots: { zh: "等等", en: "dot dot dot" },
	vdots: { zh: "竖省略号", en: "vertical dots" },
	ddots: { zh: "斜省略号", en: "diagonal dots" },
	angle: { zh: "角", en: "angle" },
	triangle: { zh: "三角形", en: "triangle" },
	square: { zh: "正方形", en: "square" },
	colon: { zh: "比", en: "divided by" },
	mid: { zh: "整除", en: "divides" },
	nmid: { zh: "不整除", en: "does not divide" },
	ll: { zh: "远小于", en: "much less than" },
	gg: { zh: "远大于", en: "much greater than" },
	simeq: { zh: "近似于", en: "is asymptotically equal to" },
	cong: { zh: "全等于", en: "is congruent to" },
	doteq: { zh: "定义等于", en: "is defined as" },
	models: { zh: "满足", en: "models" },
	prec: { zh: "先于", en: "precedes" },
	succ: { zh: "后于", en: "succeeds" },
};

/** Arithmetic operators. */
const ARITHMETIC: Record<string, { zh: string; en: string }> = {
	"+": { zh: "加", en: "plus" },
	"-": { zh: "减", en: "minus" },
	pm: { zh: "正负", en: "plus or minus" },
	mp: { zh: "负正", en: "minus or plus" },
	times: { zh: "乘以", en: "times" },
	cdot: { zh: "乘以", en: "times" },
	ast: { zh: "乘以", en: "times" },
	div: { zh: "除以", en: "divided by" },
	over: { zh: "分之", en: "over" },
	oplus: { zh: "加圈", en: "circled plus" },
	ominus: { zh: "减圈", en: "circled minus" },
	otimes: { zh: "乘圈", en: "circled times" },
	odot: { zh: "点乘", en: "circled dot" },
	vee: { zh: "或者", en: "or" },
	wedge: { zh: "并且", en: "and" },
};

/** The big operators, which take limits. */
const BIG_OPERATORS: Record<string, { zh: string; en: string }> = {
	sum: { zh: "求和", en: "sum" },
	prod: { zh: "连乘", en: "product" },
	int: { zh: "积分", en: "integral" },
	iint: { zh: "二重积分", en: "double integral" },
	iiint: { zh: "三重积分", en: "triple integral" },
	oint: { zh: "环路积分", en: "contour integral" },
	bigcup: { zh: "并集", en: "union" },
	bigcap: { zh: "交集", en: "intersection" },
	limsup: { zh: "上极限", en: "limit superior" },
	liminf: { zh: "下极限", en: "limit inferior" },
};

/** The symbols that carry a spoken name but no operator behaviour. */
const MISC: Record<string, { zh: string; en: string }> = {
	emptyset: { zh: "空集", en: "the empty set" },
	varnothing: { zh: "空集", en: "the empty set" },
	because: { zh: "因为", en: "because" },
	therefore: { zh: "所以", en: "therefore" },
	Re: { zh: "实部", en: "real part" },
	Im: { zh: "虚部", en: "imaginary part" },
	ell: { zh: "艾勒", en: "ell" },
	hbar: { zh: "约化普朗克常数", en: "h bar" },
	aleph: { zh: "阿列夫", en: "aleph" },
	wp: { zh: "韦伯函数", en: "weierstrass p" },
	imath: { zh: "约塔", en: "iota" },
	jmath: { zh: "约塔", en: "jota" },
	blacksquare: { zh: "实心方块", en: "filled square" },
	checkmark: { zh: "对勾", en: "check mark" },
	surd: { zh: "根号", en: "square root" },
	vert: { zh: "竖线", en: "vertical bar" },
	Vert: { zh: "双竖线", en: "double vertical bar" },
	top: { zh: "顶", en: "top" },
	bot: { zh: "底", en: "bottom" },
	not: { zh: "非", en: "not" },
};

/** The arrows. */
const ARROWS: Record<string, { zh: string; en: string }> = {
	uparrow: { zh: "上箭头", en: "up arrow" },
	downarrow: { zh: "下箭头", en: "down arrow" },
	updownarrow: { zh: "双向箭头", en: "up down arrow" },
	nearrow: { zh: "右上箭头", en: "northeast arrow" },
	searrow: { zh: "右下箭头", en: "southeast arrow" },
	swarrow: { zh: "左下箭头", en: "southwest arrow" },
	longleftarrow: { zh: "长左箭头", en: "long left arrow" },
	Longleftarrow: { zh: "长左箭头", en: "long left arrow" },
	longrightarrow: { zh: "长右箭头", en: "long right arrow" },
	Longrightarrow: { zh: "推出", en: "implies" },
	longleftrightarrow: { zh: "双向箭头", en: "long left right arrow" },
	Longleftrightarrow: { zh: "当且仅当", en: "if and only if" },
	mapsto: { zh: "映射到", en: "maps to" },
	hookrightarrow: { zh: "嵌入", en: "hooks into" },
	hookleftarrow: { zh: "嵌入", en: "hooked from" },
};

/** The floor and ceiling brackets: they open a bracket, so they speak once. */
const BRACKETS: Record<string, { zh: string; en: string }> = {
	lfloor: { zh: "下取整", en: "floor" },
	lceil: { zh: "上取整", en: "ceiling" },
};

/** The labels that sit above a relation. */
const OVER_LABELS: Record<string, { zh: string; en: string }> = {
	def: { zh: "定义为", en: "defined as" },
	text: { zh: "文字", en: "text" },
	triangle: { zh: "三角形", en: "triangle" },
	circ: { zh: "复合", en: "composed with" },
};

/** The set symbols \\mathbb writes. */
const DOUBLE_STRUCK: Record<string, { zh: string; en: string }> = {
	R: { zh: "实数集", en: "the real numbers" },
	N: { zh: "自然数集", en: "the natural numbers" },
	Z: { zh: "整数集", en: "the integers" },
	Q: { zh: "有理数集", en: "the rational numbers" },
	C: { zh: "复数集", en: "the complex numbers" },
};

/** The accents, spoken before their base. */
const ACCENTS: Record<string, { zh: string; en: string }> = {
	vec: { zh: "向量", en: "vector" },
	hat: { zh: "带帽", en: "hat" },
	widehat: { zh: "带帽", en: "hat" },
	tilde: { zh: "带波浪", en: "tilde" },
	widetilde: { zh: "带波浪", en: "tilde" },
	bar: { zh: "带横线", en: "bar" },
	overline: { zh: "带横线", en: "bar" },
	underline: { zh: "带下划线", en: "underline" },
	dot: { zh: "带一点", en: "dot" },
	ddot: { zh: "带两点", en: "double dot" },
};

/** The environments that carry a spoken name. */
const ENVIRONMENTS: Record<string, { zh: string; en: string }> = {
	matrix: { zh: "矩阵", en: "matrix" },
	pmatrix: { zh: "矩阵", en: "matrix" },
	bmatrix: { zh: "矩阵", en: "matrix" },
	vmatrix: { zh: "行列式", en: "determinant" },
	Vmatrix: { zh: "行列式", en: "determinant" },
	cases: { zh: "分段函数", en: "piecewise function" },
	array: { zh: "数组", en: "array" },
	align: { zh: "", en: "" },
	"align*": { zh: "", en: "" },
	aligned: { zh: "", en: "" },
	gathered: { zh: "", en: "" },
	split: { zh: "", en: "" },
	equation: { zh: "", en: "" },
	"equation*": { zh: "", en: "" },
};

/** Commands that carry no sound at all. */
const SILENT = new Set([
	"limits", "nolimits", "displaystyle", "textstyle", "scriptstyle", "scriptscriptstyle",
	"label", "notag", "nonumber", "quad", "qquad", "thinspace", "medspace", "thickspace",
	"!", ",", ";", ":", "space", "left", "right", "big", "Big", "bigg", "Bigg",
]);

/** The spoken forms that take an operand on their right. A minus that sits
 *  where an operand is expected is a SIGN, not a subtraction. */
const OPERATOR_WORDS = new Set<string>([
	...Object.values(ARITHMETIC).flatMap((spoken) => [spoken.zh, spoken.en]),
	...Object.values(RELATIONS).flatMap((spoken) => [spoken.zh, spoken.en]),
	...Object.values(ARROWS).flatMap((spoken) => [spoken.zh, spoken.en]),
	"括号", "方括号", "大括号", "左尖括号", "右尖括号", "左方括号", "右方括号",
	"逗号", "分号", "冒号", "点", "因为", "所以", "等等",
	"open parenthesis", "open bracket", "open brace", "open angle bracket",
	"open square bracket", "comma", "semicolon", "colon", "point",
	"because", "therefore", "and so on",
]);

/** The delimiters that carry a spoken name. */
const DELIMITER_SPEECH: Record<string, { zh: string; en: string }> = {
	"\\langle": { zh: "左尖括号", en: "open angle bracket" },
	"\\rangle": { zh: "右尖括号", en: "close angle bracket" },
	"\\lfloor": { zh: "下取整", en: "floor" },
	"\\rfloor": { zh: "下取整", en: "floor" },
	"\\lceil": { zh: "上取整", en: "ceiling" },
	"\\rceil": { zh: "上取整", en: "ceiling" },
	"\\|": { zh: "双竖线", en: "double vertical bar" },
	"\\{": { zh: "大括号", en: "open brace" },
	"\\}": { zh: "大括号", en: "close brace" },
	"\\vert": { zh: "竖线", en: "vertical bar" },
	"\\Vert": { zh: "双竖线", en: "double vertical bar" },
	"\\lvert": { zh: "竖线", en: "vertical bar" },
	"\\rvert": { zh: "竖线", en: "vertical bar" },
	"(": { zh: "括号", en: "open parenthesis" },
	")": { zh: "括号", en: "close parenthesis" },
	"[": { zh: "方括号", en: "open bracket" },
	"]": { zh: "方括号", en: "close bracket" },
};

/** The delimiter commands that can also appear on their own. */
const DELIMITER_COMMANDS: Record<string, { zh: string; en: string }> = {
	langle: { zh: "左尖括号", en: "open angle bracket" },
	rangle: { zh: "右尖括号", en: "close angle bracket" },
	llbracket: { zh: "左方括号", en: "open square bracket" },
	rrbracket: { zh: "右方括号", en: "close square bracket" },
};

/** The separator between matrix rows and columns. */
function separator(locale: SpeechMathLocale): string {
	return locale === "zh" ? "，" : ", ";
}

const CJK = /[\u3000-\u303f\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff\uff00-\uffef]/;

function isCjk(char: string): boolean {
	return CJK.test(char);
}

/** Join the spoken parts with NO spaces.
 *
 *  Chinese runs its words together, and a space around a lone Latin letter
 *  actively breaks the Deepgram Flux Mandarin voices: they read "x 等于负
 *  三分之二" as "istron于-2" while "x等于负三分之二" comes out clean. So a
 *  Chinese reading is joined tight; only the English reading keeps spaces. */
function joinParts(parts: string[], locale: SpeechMathLocale): string {
	const words = parts.map((part) => part.trim()).filter((part) => part.length > 0);
	if (locale === "en") return words.join(" ");
	return words.join("");
}

/** The Chinese reading of each Latin letter.
 *
 *  WHY: the Deepgram Flux Mandarin voices are Early Access and read a LONE
 *  Latin letter unreliably — measured on the live API, "a等于一" comes back
 *  clean but "b等于一" reads as "b=" and "Y等于一" as "外等一". Transcribing
 *  the letter into a Chinese syllable is stable for every letter, and it is
 *  what a teacher says out loud anyway ("y 等于" is spoken 「歪 等于」).
 */
const LETTER_ZH: Record<string, string> = {
	A: "诶", B: "必", C: "西", D: "迪", E: "伊", F: "艾弗", G: "吉",
	H: "艾尺", I: "艾", J: "杰", K: "开", L: "艾勒", M: "艾姆", N: "恩",
	O: "哦", P: "屁", Q: "扣", R: "啊", S: "艾斯", T: "提", U: "优",
	V: "维", W: "达不溜", X: "艾克斯", Y: "歪", Z: "贼",
};

/** Transcribe the Latin letters in a ZH reading into Chinese syllables.
 *
 *  Only single letters that stand alone are transcribed: a run of two or
 *  more letters is a name ("sin", "AB"), and Flux says those correctly.
 *  Greek letters already have their own Chinese names.
 */
function transcribeLetters(text: string): string {
	return text.replace(/[A-Za-z]+/g, (run) => {
		if (run.length !== 1) return run;
		return LETTER_ZH[run.toUpperCase()] ?? run;
	});
}

/** Does this rendered part already name a fraction ("三分之二")?
 *
 *  Used to decide whether a nested \frac can keep the classroom 「分之」 form:
 *  saying it twice ("三分之二分之一") reads the same for \frac{\frac{1}{2}}{3} and
 *  \frac{1}{\frac{2}{3}}, so a nested fraction switches to 「除以」 instead. */
function isSpokenFraction(part: string): boolean {
	return part.includes("分之");
}

/** The characters that write a minus: ASCII, the Unicode minus, and the
 *  fullwidth form CJK input produces. */
function isMinusChar(ch: string | undefined): boolean {
	return ch === "-" || ch === "\u2212" || ch === "\uFF0D";
}

/** The parser. One instance per formula. */
class MathReader {
	private readonly s: string;
	private i = 0;
	private readonly locale: SpeechMathLocale;
	/** True inside \\text-like commands: letters merge into words. */
	private literal = false;
	/** The environment currently open, if any. */
	private environment: string | null = null;
	/** True inside a set builder, where \mid means "such that". */
	private setBuilder = false;

	constructor(source: string, locale: SpeechMathLocale) {
		this.s = source;
		this.locale = locale;
	}

	/** The whole formula, spoken. */
	read(): string {
		const nodes = this.parseSequence();
		return renderNodes(nodes, this.locale);
	}

	/** Read the next unit: a group, a command, or a single character. */
	private readBase(): Atom | null {
		const ch = this.s[this.i];
		if (ch === undefined) return null;
		if (ch === "{") {
			const inner = this.readGroupNodes();
			return { text: renderNodes(inner, this.locale) };
		}
		if (ch === "\\") return this.readCommand();
		// A single character. Letters stay separate in math mode (they are
		// variables); in literal mode they merge into words.
		this.i++;
		if (/[A-Za-z]/.test(ch)) {
			// In math mode every letter is spoken by its own name ("a x 的平方");
			// only \text turns a run of letters into one word.
			if (!this.literal) return { text: ch };
			let word = ch;
			while (this.i < this.s.length && /[A-Za-z]/.test(this.s[this.i]!)) {
				word += this.s[this.i];
				this.i++;
			}
			return { text: word };
		}
		if (/[0-9]/.test(ch)) {
			let number = ch;
			while (this.i < this.s.length && /[0-9.]/.test(this.s[this.i]!)) {
				number += this.s[this.i];
				this.i++;
			}
			return { text: number };
		}
		// A dollar is a math delimiter leaking into the reading; drop it.
		if (ch === "$") return null;
		const symbol = SYMBOL_CHARS[ch];
		if (symbol) return { text: symbol[this.locale] };
		return { text: ch };
	}

	/** Read a command and everything it owns. */
	private readCommand(): Atom | null {
		this.i++; // the backslash
		const ch = this.s[this.i];
		if (ch === undefined) return null;
		let name = "";
		if (/[A-Za-z]/.test(ch)) {
			while (this.i < this.s.length && /[A-Za-z]/.test(this.s[this.i]!)) {
				name += this.s[this.i];
				this.i++;
			}
		} else {
			name = ch;
			this.i++;
		}
		return this.readNamedCommand(name);
	}

	private readNamedCommand(name: string): Atom | null {
		const locale = this.locale;
		if (name === "left" || name === "right") {
			// A sized bracket is decoration; a sized angle or bar is not.
			const delimiter = this.readDelimiter();
			if (delimiter === "{" || delimiter === "\\{") this.setBuilder = name === "left";
			if (delimiter === "}" || delimiter === "\\}") this.setBuilder = false;
			if (delimiter === "|" || delimiter === "\\|") {
				// \left| x \right| is an absolute value, \left\| x \right\| a norm.
				if (name !== "left") return null;
				const inner = this.readUntilRight();
				if (inner === null) return null;
				const zh = delimiter === "|" ? "绝对值" : "范数";
				const en = delimiter === "|" ? "absolute value" : "norm";
				return { text: locale === "zh" ? inner + " 的" + zh : en + " of " + inner };
			}
			const spoken = DELIMITER_SPEECH[delimiter];
			return spoken ? { text: spoken[locale] } : null;
		}
		if (name in DELIMITER_COMMANDS) return { text: DELIMITER_COMMANDS[name]![locale] };
		if (name === "lfloor" || name === "lceil") {
			const closer = name === "lfloor" ? "rfloor" : "rceil";
			const inner = this.readUntilCommand(closer);
			const zh = name === "lfloor" ? "下取整" : "上取整";
			const en = name === "lfloor" ? "floor" : "ceiling";
			return { text: locale === "zh" ? inner + " 的" + zh : en + " of " + inner };
		}
		if (name === "lvert" || name === "lVert") {
			const closer = name === "lvert" ? "rvert" : "rVert";
			const inner = this.readUntilCommand(closer);
			const zh = name === "lvert" ? "绝对值" : "范数";
			const en = name === "lvert" ? "absolute value" : "norm";
			return { text: locale === "zh" ? inner + " 的" + zh : en + " of " + inner };
		}
		if (name === "begin") {
			const env = this.readRawGroup().trim();
			this.environment = env;
			const spoken = ENVIRONMENTS[env];
			if (env === "array") this.readRawGroup();
			return spoken && spoken.zh ? { text: spoken[locale] } : null;
		}
		if (name === "end") {
			this.readRawGroup();
			this.environment = null;
			return null;
		}
		if (name === "frac" || name === "dfrac" || name === "tfrac" || name === "cfrac") {
			const numerator = renderNodes(this.readGroupNodes(), locale);
			const denominator = renderNodes(this.readGroupNodes(), locale);
			// Classroom reading names the denominator first: 2/3 → 三分之二.
			if (locale === "zh") {
				// NESTED fractions cannot use 「分之」 twice: "A分之B分之C" reads
				// the same whether A/B is the numerator or the denominator, and
				// the live Edge voice produced byte-identical audio for
				// \frac{\frac{1}{2}}{3} and \frac{1}{\frac{2}{3}}. When either side
				// is itself spoken with 「分之」, the whole fraction goes linear —
				// 「分子除以分母」 — which keeps the structure audible.
				if (isSpokenFraction(numerator) || isSpokenFraction(denominator)) {
					return { text: `${numerator}除以${denominator}` };
				}
				// A sign in the denominator belongs to the whole fraction, so it
				// moves in front: 1/(-2) → 负二分之一. A sign in the numerator
				// stays where it is: (-1)/2 → 二分之负一.
				const signed = denominator.startsWith("负");
				const numeratorSigned = numerator.startsWith("负");
				if (signed && !numeratorSigned) {
					return { text: `负${denominator.slice(1)}分之${numerator}` };
				}
				return { text: `${denominator}分之${numerator}` };
			}
			return { text: `fraction ${numerator} over ${denominator}` };
		}
		if (name === "binom" || name === "choose") {
			const top = renderNodes(this.readGroupNodes(), locale);
			const bottom = renderNodes(this.readGroupNodes(), locale);
			return { text: locale === "zh"
				? `组合数 ${top} 选 ${bottom}`
				: `binomial coefficient ${top} choose ${bottom}` };
		}
		if (name === "sqrt") {
			const degree = this.readOptionalBracket();
			const radicand = renderNodes(this.readGroupNodes(), locale);
			if (degree) {
				return { text: locale === "zh"
					? `${localizeDigits(degree, locale)}次根号${radicand}`
					: `the ${degree}th root of ${radicand}` };
			}
			return { text: locale === "zh"
				? `根号${radicand}`
				: `square root of ${radicand}` };
		}
		if (name === "text" || name === "textrm" || name === "textbf" || name === "textit" ||
			name === "textnormal" || name === "mbox" || name === "textsf") {
			const raw = this.readRawGroup();
			const inner = new MathReader(raw, locale);
			inner.literal = true;
			const spoken = inner.read();
			return spoken ? { text: spoken } : null;
		}
		if (name === "mathbb") {
			const raw = this.readRawGroup().trim();
			const spoken = DOUBLE_STRUCK[raw];
			if (spoken) return { text: spoken[locale] };
			return raw ? { text: raw } : null;
		}
		if (name === "overset" || name === "stackrel") {
			// \overset{def}{=} → "定义为等于"
			const label = this.readRawGroup().trim();
			const below = renderNodes(this.readGroupNodes(), locale);
			const spoken = OVER_LABELS[label];
			if (spoken) return { text: `${spoken[locale]} ${below}` };
			if (label) return { text: `${label} ${below}` };
			return { text: below };
		}
		if (name === "underset") {
			const below = renderNodes(this.readGroupNodes(), locale);
			const label = this.readRawGroup().trim();
			const spoken = OVER_LABELS[label];
			if (spoken) return { text: `${below} ${spoken[locale]}` };
			return { text: below };
		}
		if (name === "xrightarrow" || name === "xleftarrow" || name === "xrightarrow*") {
			const label = this.readRawGroup().trim();
			const arrow = name === "xleftarrow"
				? { zh: "左箭头", en: "left arrow" }
				: { zh: "右箭头", en: "right arrow" };
			const inner = new MathReader(label, locale);
			inner.literal = true;
			const spokenLabel = inner.read();
			return { text: spokenLabel ? `${spokenLabel} ${arrow[locale]}` : arrow[locale] };
		}
		if (name === "bmod" || name === "mod") {
			// a \bmod b — the operator sits between the two operands, so only
			// the right one is still unread.
			this.skipSpace();
			const inner = this.readArgument();
			return { text: locale === "zh" ? "取模 " + inner : "modulo " + inner };
		}
		if (name === "pmod") {
			// a \pmod{n} — the modulus follows the operator.
			this.skipSpace();
			const modulus = this.readArgument();
			return { text: locale === "zh" ? "模 " + modulus : "modulo " + modulus };
		}
		if (name === "modulo") {
			this.skipSpace();
			const inner = this.readArgument();
			return { text: locale === "zh" ? "模 " + inner : "modulo " + inner };
		}
		if (name === "operatorname" || name === "operatorname*") {
			const raw = this.readRawGroup().trim();
			return raw ? { text: raw } : null;
		}
		if (name === "mathrm" || name === "mathbf" || name === "mathit" || name === "mathcal" ||
			name === "mathsf" || name === "mathtt" || name === "boldsymbol") {
			const inner = this.readGroupNodes();
			return { text: renderNodes(inner, locale) };
		}
		if (name in ACCENTS) {
			const spoken = ACCENTS[name]!;
			const inner = renderNodes(this.readGroupNodes(), locale);
			const prefix = spoken[locale];
			if (!prefix) return { text: inner };
			return { text: locale === "zh" ? `${prefix} ${inner}` : `${prefix} ${inner}` };
		}
		if (name === "lim" || name === "limsup" || name === "liminf") {
			// \lim_{x \to 0} — the lower script is the condition, not a subscript.
			const lower = this.readOptionalScript("_");
			const spoken = FUNCTIONS[name] ?? BIG_OPERATORS[name];
			if (!spoken) return { text: name };
			const low = lower ? renderNodes(lower, locale) : "";
			if (!low) return { text: spoken[locale] };
			return { text: locale === "zh"
				? `${spoken.zh} 当 ${low}`
				: `${spoken.en} as ${low}` };
		}
		if (name in BIG_OPERATORS) {
			const spoken = BIG_OPERATORS[name]!;
			const lower = this.readOptionalScript("_");
			const upper = this.readOptionalScript("^");
			const low = lower ? renderNodes(lower, locale) : "";
			const high = upper ? renderNodes(upper, locale) : "";
			if (low && high) {
				return { text: locale === "zh"
					? `从 ${low} 到 ${high} 的 ${spoken.zh}`
					: `${spoken.en} from ${low} to ${high}` };
			}
			if (low) return { text: locale === "zh" ? `从 ${low} 起的 ${spoken.zh}` : `${spoken.en} from ${low}` };
			if (high) return { text: locale === "zh" ? `到 ${high} 的 ${spoken.zh}` : `${spoken.en} to ${high}` };
			return { text: spoken[locale] };
		}
		if (name === "nexists") return { text: locale === "zh" ? "不存在" : "there does not exist" };
		if (name === "coprod") return { text: locale === "zh" ? "不交并" : "coproduct" };
		if (name === "bigsqcup") return { text: locale === "zh" ? "并集" : "union" };
		if (name === "bigsqcap") return { text: locale === "zh" ? "交集" : "intersection" };
		if (name === "bigvee") return { text: locale === "zh" ? "或" : "or" };
		if (name === "bigwedge") return { text: locale === "zh" ? "与" : "and" };
		if (name === "bigoplus") return { text: locale === "zh" ? "直和" : "direct sum" };
		if (name === "bigotimes") return { text: locale === "zh" ? "张量积" : "tensor product" };
		if (name === "biguplus") return { text: locale === "zh" ? "并集" : "union" };
		if (name === "biguplus") return { text: locale === "zh" ? "并集" : "union" };
		if (name === "uplus") return { text: locale === "zh" ? "并集" : "union" };
		if (name === "sqcup") return { text: locale === "zh" ? "并集" : "union" };
		if (name === "sqcap") return { text: locale === "zh" ? "交集" : "intersection" };
		if (name === "mathfrak" || name === "mathscr" || name === "mathsf" ||
			name === "mathtt" || name === "boldsymbol") {
			const inner = renderNodes(this.readGroupNodes(), locale);
			return { text: inner };
		}
		if (name in GREEK) return { text: GREEK[name]![locale] };
		if (name in FUNCTIONS) return { text: FUNCTIONS[name]![locale] };
		if (name === "mid") {
			// "\mid" inside a set builder is "such that"; on its own it is
			// the divisibility bar.
			return { text: this.setBuilder ? (locale === "zh" ? "使得" : "such that")
				: RELATIONS.mid![locale] };
		}
		if (name in RELATIONS) return { text: RELATIONS[name]![locale] };
		if (name in ARITHMETIC) return { text: ARITHMETIC[name]![locale] };
		if (name in MISC) return { text: MISC[name]![locale] };
		if (name in ARROWS) return { text: ARROWS[name]![locale] };
		if (name in BRACKETS) return { text: BRACKETS[name]![locale] };
		if (name === "lfloor" || name === "rfloor" || name === "lceil" || name === "rceil") {
			return { text: BRACKETS[name === "lfloor" || name === "rfloor" ? "lfloor" : "lceil"]![locale] };
		}
		if (name === "%") return { text: locale === "zh" ? "百分之" : "percent" };
		if (name === "vert" || name === "rvert") {
			return { text: locale === "zh" ? "竖线" : "vertical bar" };
		}
		if (name === "&") return { text: separator(locale) };
		if (name === "\\") return { text: separator(locale) };
		if (SILENT.has(name)) return null;
		if (name === "{") {
			this.setBuilder = true;
			return { text: locale === "zh" ? "大括号" : "open brace" };
		}
		if (name === "}") {
			this.setBuilder = false;
			return { text: locale === "zh" ? "大括号" : "close brace" };
		}
		if (name === "$") return null;
		// Unknown command: read it as its own name rather than dropping it.
		return { text: name };
	}

	/** Read a delimiter after \\left or \\right.
	 *
	 *  The delimiter may be a single character ("(", "|") or a control
	 *  word ("\\langle", "\\|") — the whole word belongs to the
	 *  delimiter, so it is read in one piece. */
	private readDelimiter(): string {
		if (this.s[this.i] === "\\") {
			this.i++;
			const ch = this.s[this.i];
			if (ch !== undefined && /[A-Za-z]/.test(ch)) {
				let word = ch;
				this.i++;
				while (this.i < this.s.length && /[A-Za-z]/.test(this.s[this.i]!)) {
					word += this.s[this.i];
					this.i++;
				}
				return "\\" + word;
			}
			this.i++;
			// An escaped symbol belongs to the delimiter as a whole.
			return ch === undefined ? "" : "\\" + ch;
		}
		const ch = this.s[this.i];
		if (ch === undefined) return "";
		this.i++;
		return ch;
	}

	/** Read a single argument: a {...} group or one atom. */
	private readArgument(): string {
		this.skipSpace();
		if (this.s[this.i] === "{") {
			return renderNodes(this.readGroupNodes(), this.locale);
		}
		const atom = this.readBase();
		return atom ? renderNodes([atom], this.locale) : "";
	}

	/** Read everything up to the next \right, then consume that \right. */
	private readUntilRight(): string | null {
		const rest = this.s.slice(this.i);
		const match = /\\right/.exec(rest);
		if (!match) return null;
		const inner = rest.slice(0, match.index);
		this.i += match.index + "\\right".length;
		this.readDelimiter();
		return new MathReader(inner, this.locale).read();
	}

	/** Read everything up to the next \\name command, then consume it. */
	private readUntilCommand(name: string): string {
		const rest = this.s.slice(this.i);
		const match = new RegExp("\\\\" + name + "(?![A-Za-z])").exec(rest);
		if (!match) {
			const inner = rest;
			this.i = this.s.length;
			return new MathReader(inner, this.locale).read();
		}
		const inner = rest.slice(0, match.index);
		this.i += match.index + 1 + name.length;
		return new MathReader(inner, this.locale).read();
	}

	/** Read a label as plain text. */
	private readLiteral(source: string): string {
		const inner = new MathReader(source, this.locale);
		inner.literal = true;
		return inner.read();
	}

	/** Read a {...} group, raw. */
	private readRawGroup(): string {
		if (this.s[this.i] !== "{") return "";
		let depth = 0;
		let out = "";
		while (this.i < this.s.length) {
			const ch = this.s[this.i]!;
			if (ch === "\\") {
				out += ch + (this.s[this.i + 1] ?? "");
				this.i += 2;
				continue;
			}
			if (ch === "{") { depth++; this.i++; if (depth === 1) continue; out += ch; continue; }
			if (ch === "}") {
				depth--;
				this.i++;
				if (depth === 0) return out;
				out += ch;
				continue;
			}
			out += ch;
			this.i++;
		}
		return out;
	}

	/** Read a {...} group as nodes. */
	private readGroupNodes(): Atom[] {
		if (this.s[this.i] !== "{") return [];
		this.i++;
		const nodes = this.parseSequence(true);
		if (this.s[this.i] === "}") this.i++;
		return nodes;
	}

	/** Read an optional [..] index. */
	private readOptionalBracket(): string | null {
		if (this.s[this.i] !== "[") return null;
		this.i++;
		let depth = 1;
		let out = "";
		while (this.i < this.s.length) {
			const ch = this.s[this.i]!;
			if (ch === "[") depth++;
			if (ch === "]") {
				depth--;
				if (depth === 0) { this.i++; break; }
			}
			out += ch;
			this.i++;
		}
		return renderNodes(new MathReader(out, this.locale).parseSequence(), this.locale);
	}

	/** Read the script after a base, when the caller asks for one. */
	private readOptionalScript(kind: "^" | "_"): Atom[] | null {
		this.skipSpace();
		if (this.s[this.i] !== kind) return null;
		this.i++;
		this.skipSpace();
		if (this.s[this.i] === "{") return this.readGroupNodes();
		const atom = this.readBase();
		return atom ? [atom] : null;
	}

	/** Parse a run of atoms until the group closes. */
	private parseSequence(inGroup = false): Atom[] {
		const nodes: Atom[] = [];
		// Where an operand is expected, "-" is a sign: -2/3 → 负三分之二.
		let needOperand = true;
		while (this.i < this.s.length) {
			this.skipSpace();
			const ch = this.s[this.i];
			if (ch === undefined) break;
			if (ch === "}") {
				if (inGroup) break;
				this.i++;
				continue;
			}
			if (ch === "&") {
				this.i++;
				nodes.push({ text: separator(this.locale) });
				continue;
			}
			if (ch === "|") {
				// A vertical bar pair is an absolute value: |x| → "x 的绝对值".
				const close = this.findClosingBar();
				if (close !== null) {
					const inner = new MathReader(this.s.slice(this.i + 1, close), this.locale).read();
					this.i = close + 1;
					nodes.push({ text: this.locale === "zh"
						? `${inner} 的绝对值`
						: `absolute value of ${inner}` });
					continue;
				}
			}
			if (ch === "^" || ch === "_") {
				const script = this.readOptionalScript(ch);
				const last = nodes[nodes.length - 1];
				if (!script) continue;
				const spoken = renderNodes(script, this.locale);
				if (!last) { nodes.push({ text: spoken }); continue; }
				if (ch === "^") last.sup = spoken;
				else last.sub = spoken;
				continue;
			}
			if (isMinusChar(ch) && needOperand) {
				this.i++;
				nodes.push({ text: this.locale === "zh" ? "负" : "negative" });
				continue;
			}
			if (isMinusChar(ch) && !needOperand) {
				// A subtraction whose right operand is bracketed reads 减去:
				// 3 - (-2) → 三减去括号负二括号.
				let ahead = this.i + 1;
				while (ahead < this.s.length && /\s/.test(this.s[ahead]!)) ahead++;
				if (this.s[ahead] === "(" || this.s[ahead] === "[") {
					this.i = ahead;
					nodes.push({ text: this.locale === "zh" ? "减去" : "minus" });
					needOperand = true;
					continue;
				}
			}
			const atom = this.readBase();
			if (!atom) continue;
			nodes.push(atom);
			// A closing bracket ends an operand even though its spoken form is
			// the same word as the opening one: (x-1) - 2 is a subtraction.
			needOperand = ch === ")" || ch === "]" || ch === "}"
				? false
				: isOperatorAtom(atom);
		}
		return nodes;
	}

	/** Find the index of the bar that closes an absolute value, or null. */
	private findClosingBar(): number | null {
		let depth = 0;
		for (let i = this.i + 1; i < this.s.length; i++) {
			const ch = this.s[i]!;
			if (ch === "{") depth++;
			else if (ch === "}") depth--;
			else if (ch === "|" && depth === 0) return i;
		}
		return null;
	}

	private skipSpace(): void {
		while (this.i < this.s.length && /\s/.test(this.s[this.i]!)) this.i++;
	}
}

/** The symbols that have a spoken name of their own. */
const SYMBOL_CHARS: Record<string, { zh: string; en: string }> = {
	"+": { zh: "加", en: "plus" },
	"-": { zh: "减", en: "minus" },
	"=": { zh: "等于", en: "equals" },
	// The typographic forms a model writes when it is being careful:
	// fullwidth ＋ － ＝ (CJK input) and the Unicode minus U+2212.
	"\uFF0B": { zh: "加", en: "plus" },
	"\uFF0D": { zh: "减", en: "minus" },
	"\u2212": { zh: "减", en: "minus" },
	"\uFF1D": { zh: "等于", en: "equals" },
	"\u2E40": { zh: "等于", en: "equals" },
	"\uA78A": { zh: "等于", en: "equals" },
	"<": { zh: "小于", en: "less than" },
	">": { zh: "大于", en: "greater than" },
	"(": { zh: "括号", en: "open parenthesis" },
	")": { zh: "括号", en: "close parenthesis" },
	"[": { zh: "方括号", en: "open bracket" },
	"]": { zh: "方括号", en: "close bracket" },
	"\\{": { zh: "大括号", en: "open brace" },
	"\\}": { zh: "大括号", en: "close brace" },
	",": { zh: "逗号", en: "comma" },
	";": { zh: "分号", en: "semicolon" },
	":": { zh: "冒号", en: "colon" },
	".": { zh: "点", en: "point" },
	"'": { zh: "撇", en: "prime" },
	"!": { zh: "阶乘", en: "factorial" },
	"?": { zh: "问号", en: "question mark" },
	"/": { zh: "除以", en: "divided by" },
	"*": { zh: "乘以", en: "times" },
	"%": { zh: "百分之", en: "percent" },
	"#": { zh: "井号", en: "number sign" },
	"~": { zh: "约等于", en: "approximately equals" },
	"@": { zh: "艾特", en: "at" },
	"_": { zh: "下划线", en: "underscore" },
	"\\": { zh: "换行", en: "new line" },

	// Unicode relations.
	"\u2264": { zh: "小于等于", en: "less than or equal to" },
	"\u2265": { zh: "大于等于", en: "greater than or equal to" },
	"\u2260": { zh: "不等于", en: "not equal to" },
	"\u2261": { zh: "恒等于", en: "is identical to" },
	"\u2245": { zh: "近似于", en: "is asymptotically equal to" },
	"\u2248": { zh: "约等于", en: "approximately equals" },
	"\u224c": { zh: "全等于", en: "is congruent to" },
	"\u223c": { zh: "近似于", en: "is similar to" },
	"\u221d": { zh: "正比于", en: "is proportional to" },
	"\u225c": { zh: "全等于", en: "is congruent to" },
	"\u2254": { zh: "定义等于", en: "is defined as" },

	// Unicode arithmetic.
	"\u00b1": { zh: "正负", en: "plus or minus" },
	"\u2213": { zh: "负正", en: "minus or plus" },
	"\u00d7": { zh: "乘以", en: "times" },
	"\u00f7": { zh: "除以", en: "divided by" },
	"\u22c5": { zh: "点乘", en: "dot product" },
	"\u2217": { zh: "乘以", en: "times" },
	"\u2218": { zh: "复合", en: "composed with" },
	"\u221a": { zh: "根号", en: "square root" },
	"\u221b": { zh: "立方根", en: "cube root" },
	"\u221e": { zh: "无穷大", en: "infinity" },

	// Unicode big operators.
	"\u222b": { zh: "积分", en: "integral" },
	"\u222c": { zh: "二重积分", en: "double integral" },
	"\u222d": { zh: "三重积分", en: "triple integral" },
	"\u222e": { zh: "环路积分", en: "contour integral" },
	"\u2211": { zh: "求和", en: "sum" },
	"\u220f": { zh: "连乘", en: "product" },
	"\u2210": { zh: "不交并", en: "coproduct" },
	"\u2a01": { zh: "加圈", en: "circled plus" },
	"\u2a02": { zh: "减圈", en: "circled minus" },
	"\u2a04": { zh: "乘圈", en: "circled times" },
	"\u2a00": { zh: "点乘", en: "circled dot" },

	// Unicode sets and logic.
	"\u2205": { zh: "空集", en: "the empty set" },
	"\u2208": { zh: "属于", en: "is an element of" },
	"\u2209": { zh: "不属于", en: "is not an element of" },
	"\u220b": { zh: "包含", en: "contains" },
	"\u2282": { zh: "真包含于", en: "is a proper subset of" },
	"\u2283": { zh: "真包含", en: "is a proper superset of" },
	"\u2286": { zh: "包含于", en: "is a subset of" },
	"\u2287": { zh: "包含", en: "is a superset of" },
	"\u222a": { zh: "并集", en: "union" },
	"\u2229": { zh: "交集", en: "intersection" },
	"\u2216": { zh: "除去", en: "set minus" },
	"\u00ac": { zh: "非", en: "not" },
	"\u2200": { zh: "对任意", en: "for all" },
	"\u2203": { zh: "存在", en: "there exists" },
	"\u2204": { zh: "不存在", en: "there does not exist" },
	"\u22a5": { zh: "垂直于", en: "is perpendicular to" },
	"\u2225": { zh: "平行于", en: "is parallel to" },

	// Unicode arrows.
	"\u2192": { zh: "右箭头", en: "right arrow" },
	"\u2190": { zh: "左箭头", en: "left arrow" },
	"\u2194": { zh: "双向箭头", en: "left right arrow" },
	"\u21a6": { zh: "映射到", en: "maps to" },
	"\u21d2": { zh: "推出", en: "implies" },
	"\u21d0": { zh: "左箭头", en: "left arrow" },
	"\u21d4": { zh: "当且仅当", en: "if and only if" },
	"\u21d1": { zh: "上箭头", en: "up arrow" },
	"\u21d3": { zh: "下箭头", en: "down arrow" },
	"\u27f6": { zh: "长右箭头", en: "long right arrow" },
	"\u27f5": { zh: "长左箭头", en: "long left arrow" },
	"\u27f9": { zh: "推出", en: "implies" },
	"\u27f8": { zh: "当且仅当", en: "if and only if" },

	// Unicode misc.
	"\u2220": { zh: "角", en: "angle" },
	"\u00b0": { zh: "度", en: "degrees" },
	"\u2032": { zh: "撇", en: "prime" },
	"\u2033": { zh: "双撇", en: "double prime" },
	"\u2202": { zh: "偏导", en: "partial derivative" },
	"\u2207": { zh: "梯度", en: "gradient" },
	"\u2026": { zh: "等等", en: "and so on" },
	"\u22ef": { zh: "等等", en: "dot dot dot" },
	"\u22ee": { zh: "竖省略号", en: "vertical dots" },
	"\u22f1": { zh: "斜省略号", en: "diagonal dots" },
	"\u2234": { zh: "因为", en: "because" },
	"\u2235": { zh: "所以", en: "therefore" },
	"\u230a": { zh: "上取整", en: "ceiling" },
	"\u230b": { zh: "下取整", en: "floor" },
	"\u2308": { zh: "左取整", en: "ceiling" },
	"\u2309": { zh: "右取整", en: "floor" },
	"\u2115": { zh: "分数", en: "fraction" },
	"\u2135": { zh: "艾勒", en: "ell" },
	"\u211d": { zh: "实数集", en: "the real numbers" },
	"\u2297": { zh: "加圈", en: "circled plus" },
	"\u2296": { zh: "减圈", en: "circled minus" },
	"\u2298": { zh: "乘圈", en: "circled times" },
	"\u2299": { zh: "点乘", en: "circled dot" },
};


/** Digits inside a spoken part, read as numerals.
 *  A Chinese voice says "二 x" for 2x; the formula keeps the digits in the
 *  source, so the conversion happens here, at speak time. */
function localizeDigits(raw: string, locale: SpeechMathLocale): string {
	if (locale !== "zh") return raw;
	return raw.replace(/\d+(?:\.\d+)?/g, (run) => {
		const value = Number(run);
		if (!Number.isFinite(value)) return run;
		return run.includes(".") ? zhDecimal(value) : zhInteger(value);
	});
}

/** True when the atom wants an operand on its right. */
function isOperatorAtom(atom: Atom): boolean {
	if (atom.sup || atom.sub) return false;
	return OPERATOR_WORDS.has(atom.text);
}

/** Render the atoms into the spoken text. */
function renderNodes(nodes: Atom[], locale: SpeechMathLocale): string {
	const parts: string[] = [];
	for (const node of nodes) {
		let text = localizeDigits(node.text, locale);
		if (node.sub) {
			const sub = localizeDigits(node.sub, locale);
			text += locale === "zh" ? `下标${sub}` : ` sub ${sub}`;
		}
		if (node.sup) {
			if (locale === "zh") {
				if (node.sup === "2" || node.sup === "二") text += "的平方";
				else if (node.sup === "3" || node.sup === "三") text += "的立方";
				else text += `的${localizeDigits(node.sup, locale)}次方`;
			} else {
				if (node.sup === "2") text += " squared";
				else if (node.sup === "3") text += " cubed";
				else text += ` to the power of ${node.sup}`;
			}
		}
		parts.push(text);
	}
	return joinParts(parts, locale);
}

/** Read one LaTeX formula as spoken text.
 *
 *  The formula is best-effort: an unknown command is read as its own
 *  name, and an unparsable structure falls back to the source text.
 *  Nothing is dropped silently. */
export function speakMath(tex: string, locale: SpeechMathLocale, letterNames = true): string {
	const source = tex.trim();
	if (!source) return "";
	const spoken = new MathReader(source, locale).read();
	// A ZH reading transcribes lone Latin letters: the Flux Mandarin voices
	// read several of them wrong on their own (see LETTER_ZH). A provider that
	// says the letters correctly (Edge) switches this off and keeps "x".
	return locale === "zh" && letterNames ? transcribeLetters(spoken) : spoken;
}

/** A prose operator: the symbol and the words it reads as. */
const PROSE_OPERATORS: Array<{ match: RegExp; zh: string; en: string }> = [
	// Relations, longest first so "<=" never loses to "<".
	{ match: /<=/g, zh: " 小于等于 ", en: " less than or equal to " },
	{ match: />=/g, zh: " 大于等于 ", en: " greater than or equal to " },
	{ match: /!=|\u2260/g, zh: " 不等于 ", en: " not equal to " },
	{ match: /\u2264/g, zh: " 小于等于 ", en: " less than or equal to " },
	{ match: /\u2265/g, zh: " 大于等于 ", en: " greater than or equal to " },
	{ match: /\u2261/g, zh: " 恒等于 ", en: " is identical to " },
	{ match: /\u2248|\u2245/g, zh: " 约等于 ", en: " approximately equals " },
	{ match: /\u221d/g, zh: " 正比于 ", en: " is proportional to " },
	{ match: /\u223c/g, zh: " 近似于 ", en: " is similar to " },
	{ match: /=|\uFF1D/g, zh: " 等于 ", en: " equals " },
	// Arithmetic.
	{ match: /\u00d7/g, zh: " 乘以 ", en: " times " },
	{ match: /\u00f7|\u2215|\u2044/g, zh: " 除以 ", en: " divided by " },
	{ match: /\u00b1/g, zh: " 正负 ", en: " plus or minus " },
	{ match: /\u2213/g, zh: " 负正 ", en: " minus or plus " },
	{ match: /\+|\uFF0B/g, zh: " 加 ", en: " plus " },
	{ match: /-|\u2212|\uFF0D/g, zh: " 减 ", en: " minus " },
	// Set and logic.
	{ match: /\u2208/g, zh: " 属于 ", en: " is in " },
	{ match: /\u2209/g, zh: " 不属于 ", en: " is not in " },
	{ match: /\u2286/g, zh: " 包含于 ", en: " is a subset of " },
	{ match: /\u2282/g, zh: " 真包含于 ", en: " is a proper subset of " },
	{ match: /\u222a/g, zh: " 并集 ", en: " union " },
	{ match: /\u2229/g, zh: " 交集 ", en: " intersection " },
	{ match: /\u2205/g, zh: " 空集 ", en: " the empty set " },
	{ match: /\u2200/g, zh: " 对任意 ", en: " for all " },
	{ match: /\u2203/g, zh: " 存在 ", en: " there exists " },
	{ match: /\u00ac/g, zh: " 非 ", en: " not " },
	{ match: /\u22a5/g, zh: " 垂直于 ", en: " is perpendicular to " },
	{ match: /\u2225/g, zh: " 平行于 ", en: " is parallel to " },
	{ match: /\u2192/g, zh: " 趋于 ", en: " tends to " },
	{ match: /\u21d2/g, zh: " 推出 ", en: " implies " },
	{ match: /\u21d4/g, zh: " 当且仅当 ", en: " if and only if " },
	// Constants and misc.
	{ match: /\u03c0/g, zh: "派", en: " pi " },
	{ match: /\u221e/g, zh: "无穷大", en: " infinity " },
	{ match: /\u221a/g, zh: "根号", en: " square root of " },
	{ match: /\u00b7/g, zh: " 乘以 ", en: " times " },
	{ match: /\u2026/g, zh: "等等", en: " and so on " },
	{ match: /\u2234/g, zh: "因为", en: " because " },
	{ match: /\u2235/g, zh: "所以", en: " therefore " },
	{ match: /\u00b0/g, zh: "度", en: " degrees " },
	{ match: /\u2236/g, zh: " 比 ", en: " to " },
];

/** Speak the operators left inside PROSE.
 *
 *  A lesson line often writes a formula without math delimiters — "对称轴
 *  x = -b/2a". That text reaches the voice as raw symbols, and a Chinese
 *  voice cannot say "=". This pass names the symbols that have a spoken
 *  form and leaves everything else exactly as written.
 *
 *  Nothing inside a URL or a file path is touched: a lesson about code
 *  says "docs/speech.md", and "=" inside a query string is not an equation.
 */
export function speakMathOperators(text: string, locale: SpeechMathLocale): string {
	if (!text) return text;
	const zh = locale === "zh";
	let out = text;

	// Protect URLs and file paths: swap them for placeholders, restore later.
	const kept: string[] = [];
	const protect = (value: string) => {
		kept.push(value);
		return `\u0000${kept.length - 1}\u0000`;
	};
	out = out.replace(/https?:\/\/[^\s)\]]+/g, protect);
	out = out.replace(/(?:[\w.-]*\/)+[\w.-]*\.[A-Za-z0-9]+/g, protect);

	// Superscript digits belong to the term before them.
	out = out.replace(/\u00b2/g, zh ? "的平方" : " squared");
	out = out.replace(/\u00b3/g, zh ? "的立方" : " cubed");
	// x^2 → x 的平方; a simple exponent only, anything else keeps its caret.
	out = out.replace(/\^(\{[^{}]*\}|-?\d+)/g, (_m, rawExp: string) => {
		const exp = rawExp.startsWith("{") ? rawExp.slice(1, -1).trim() : rawExp;
		if (exp === "2") return zh ? "的平方" : " squared";
		if (exp === "3") return zh ? "的立方" : " cubed";
		if (/^-\d+$/.test(exp)) return zh ? `的负${exp.slice(1)}次方` : ` to the power of negative ${exp.slice(1)}`;
		return zh ? `的${exp}次方` : ` to the power of ${exp}`;
	});
	// A simple subscript: x_1 → x 下标 1.
	out = out.replace(/_(\{[^{}]*\}|[A-Za-z0-9])/g, (matched: string, rawSub: string) => {
		const sub = rawSub.startsWith("{") ? rawSub.slice(1, -1).trim() : rawSub;
		if (!/^[A-Za-z0-9]+$/.test(sub)) return matched;
		return zh ? ` 下标 ${sub}` : ` sub ${sub}`;
	});
	// A slash between two math-ish tokens is division.
	out = out.replace(/(?<=[\w)\]])\s*\/\s*(?=[\w(])/g, () => zh ? " 除以 " : " divided by ");

	for (const entry of PROSE_OPERATORS) {
		entry.match.lastIndex = 0;
		out = out.replace(entry.match, (matched: string, offset: number, whole: string) => {
			// A minus that opens a term is a sign, not a subtraction.
			if (entry.zh === " 减 ") {
				const before = whole.slice(0, offset).replace(/\s+$/, "");
				const opensTerm = before === ""
					|| /[=<>+\-*/^(,]$/.test(before)
					|| [...OPERATOR_WORDS].some((word) => before.endsWith(word));
				if (opensTerm) return zh ? "负" : " negative ";
			}
			return entry[locale];
		});
	}

	out = out.replace(/\u0000(\d+)\u0000/g, (_m, i: string) => kept[Number(i)]!);
	return out;
}
