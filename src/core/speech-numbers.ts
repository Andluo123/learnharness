/**
 * SPEECH NUMBERS (TTS, 2026-11-20) — the number/date expansion layer.
 *
 * WHY this exists: Deepgram Flux's Chinese voices (and 32 other languages)
 * are marked Early Access WITHOUT server-side text normalization. The
 * official reference says it plainly — "numbers, dates, and abbreviations
 * are read as written, so write them out in words." So a lesson saying
 * "2024年3月5日" would be read as bare digits unless WE expand it first.
 *
 * The rule of this module: BEST EFFORT, NEVER LOSSY. An expansion that
 * cannot be made confidently leaves the author's text EXACTLY as written.
 * A mangled number is worse than a spoken digit.
 */

/** The reading language. "zh" reads digits as Mandarin numerals, "en" as
 *  English number words. */
export type SpeechNumberLocale = "zh" | "en";

const ZH_DIGITS = ["零", "一", "二", "三", "四", "五", "六", "七", "八", "九"];
const ZH_UNITS = ["", "十", "百", "千"];
const ZH_GROUPS = ["", "万", "亿", "万亿", "兆"];
const EN_ONES = ["zero", "one", "two", "three", "four", "five", "six", "seven", "eight", "nine",
	"ten", "eleven", "twelve", "thirteen", "fourteen", "fifteen", "sixteen", "seventeen",
	"eighteen", "nineteen"];
const EN_TENS = ["", "", "twenty", "thirty", "forty", "fifty", "sixty", "seventy", "eighty", "ninety"];
const EN_SCALES = ["", " thousand", " million", " billion", " trillion"];
const EN_MONTHS = ["January", "February", "March", "April", "May", "June", "July",
	"August", "September", "October", "November", "December"];
const EN_ORDINALS = ["zeroth", "first", "second", "third", "fourth", "fifth", "sixth",
	"seventh", "eighth", "ninth", "tenth", "eleventh", "twelfth", "thirteenth",
	"fourteenth", "fifteenth", "sixteenth", "seventeenth", "eighteenth", "nineteenth",
	"twentieth", "twenty-first", "twenty-second", "twenty-third", "twenty-fourth",
	"twenty-fifth", "twenty-sixth", "twenty-seventh", "twenty-eighth", "twenty-ninth",
	"thirtieth", "thirty-first"];

/** Guess the reading language from the text itself.
 *
 *  ANY CJK character means a Chinese reading context: a digit that sits
 *  inside a Chinese sentence is read as Chinese numerals, even when the
 *  sentence also carries English technical terms. An English passage has
 *  no CJK at all, so it reads as English number words.
 *
 *  This is the FALLBACK only. The voice decides the language when the
 *  voice is known — a Chinese voice reads Chinese numerals even for an
 *  English passage, because the voice IS the language. */
export function detectSpeechLocale(text: string): SpeechNumberLocale {
	const cjk = (text.match(/[\u3400-\u4dbf\u4e00-\u9fff\uf900-\ufaff]/g) ?? []).length;
	return cjk > 0 ? "zh" : "en";
}

// ─── Chinese numerals ────────────────────────────────────────────────────────

function zhUnderThousand(n: number): string {
	if (n === 0) return "";
	const digits = String(n).split("").map(Number);
	const length = digits.length;
	let out = "";
	let pendingZero = false;
	for (let i = 0; i < length; i++) {
		const digit = digits[length - 1 - i]!;
		if (digit === 0) { pendingZero = true; continue; }
		if (pendingZero && out) out = "零" + out;
		pendingZero = false;
		out = ZH_DIGITS[digit]! + ZH_UNITS[i]! + out;
	}
	return out;
}

/** An integer read as Mandarin numerals. 105 → 一百零五, 10 → 十,
 *  10010 → 一万零一十. */
export function zhInteger(value: number): string {
	if (!Number.isFinite(value)) return "";
	const n = Math.trunc(value);
	if (n === 0) return "零";
	if (n < 0) return "负" + zhInteger(-n);
	const groups: number[] = [];
	let rest = n;
	while (rest > 0) { groups.push(rest % 10000); rest = Math.floor(rest / 10000); }
	let out = "";
	for (let i = groups.length - 1; i >= 0; i--) {
		const group = groups[i]!;
		if (group === 0) continue;
		let chunk = zhUnderThousand(group);
		// The leading 一 is dropped ONLY for a bare ten (10 → 十); inside a
		// larger number it stays (一万零一十).
		if (i === 0 && groups.length === 1 && chunk.startsWith("一十")) chunk = chunk.slice(1);
		// A lower group below a thousand bridges with 零: 一万零二百.
		if (out && group < 1000) out += "零";
		out += chunk + ZH_GROUPS[i]!;
	}
	return out;
}

/** A year is read digit by digit: 2024 → 二零二四. */
function zhYear(value: number): string {
	return String(value).split("").map((d) => ZH_DIGITS[Number(d)] ?? d).join("");
}

// ─── English numerals ───────────────────────────────────────────────────────

/** An integer read as English number words. 105 → "one hundred five". */
export function enInteger(value: number): string {
	if (!Number.isFinite(value)) return "";
	const n = Math.trunc(value);
	if (n === 0) return "zero";
	if (n < 0) return "negative " + enInteger(-n);
	const groups: number[] = [];
	let rest = n;
	while (rest > 0) { groups.push(rest % 1000); rest = Math.floor(rest / 1000); }
	let out = "";
	for (let i = groups.length - 1; i >= 0; i--) {
		const group = groups[i]!;
		if (group === 0) continue;
		out += (out ? " " : "") + enUnderThousand(group) + EN_SCALES[i]!;
	}
	return out;
}

function enUnderThousand(n: number): string {
	const hundreds = Math.floor(n / 100);
	const rest = n % 100;
	let out = "";
	if (hundreds) out += EN_ONES[hundreds]! + " hundred";
	if (rest === 0) return out;
	if (rest < 20) { out += (out ? " " : "") + EN_ONES[rest]!; return out; }
	const tens = Math.floor(rest / 10);
	const ones = rest % 10;
	out += (out ? " " : "") + EN_TENS[tens]!;
	if (ones) out += "-" + EN_ONES[ones]!;
	return out;
}

/** Two-digit year halves: 05 → "oh five", 20 → "twenty", 24 → "twenty-four". */
function enPair(n: number): string {
	if (n === 0) return "oh";
	if (n < 10) return "oh " + EN_ONES[n]!;
	const tens = Math.floor(n / 10);
	const ones = n % 10;
	if (ones === 0) return EN_TENS[tens]!;
	return EN_TENS[tens]! + "-" + EN_ONES[ones]!;
}

/** A year read in pairs: 2024 → "twenty twenty-four", 1900 → "nineteen hundred". */
function enYear(value: number): string {
	const s = String(value);
	if (s.length !== 4) return enInteger(value);
	const a = Number(s.slice(0, 2));
	const b = Number(s.slice(2));
	if (b === 0) {
		if (a === 20) return "two thousand";
		if (a === 0) return enInteger(value);
		return enPair(a) + " hundred";
	}
	return enPair(a) + " " + enPair(b);
}

/** Minutes read as a clock says them: 5 → "five", 30 → "thirty",
 *  45 → "forty-five". */
function enMinute(value: number): string {
	if (value === 0) return "";
	if (value < 20) return EN_ONES[value]!;
	const tens = Math.floor(value / 10);
	const ones = value % 10;
	return ones ? EN_TENS[tens]! + "-" + EN_ONES[ones]! : EN_TENS[tens]!;
}

// ─── the expansion pass ─────────────────────────────────────────────────────

/** One pass over the text: every recognised numeric form is expanded in
 *  place, and anything unrecognised is left untouched. The alternatives are
 *  ordered longest-first so a full date is never half-matched. */
const PATTERN = new RegExp([
	/(\d{4})-(\d{1,2})-(\d{1,2})/,
	/(\d{4})\s*年(?:\s*(\d{1,2})\s*月)?(?:\s*(\d{1,2})\s*日)?/,
	/(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?/,
	/(\d{1,2}):(\d{2})/,
	/([$\u00a5\u20ac\u00a3])\s*(\d+(?:\.\d+)?)/,
	/(\d+(?:\.\d+)?)\s*%/,
	/\d+\.\d+/,
	/\d+/,
].map((re) => re.source).join("|"), "g");

/** A decimal read digit by digit after the point: 3.14 → 三点一四. */
export function zhDecimal(value: number): string {
	const [whole, fraction] = String(Math.abs(value)).split(".");
	const sign = value < 0 ? "负" : "";
	const head = whole ? zhInteger(Number(whole)) : "零";
	const tail = (fraction ?? "").split("").map((d) => ZH_DIGITS[Number(d)] ?? d).join("");
	return sign + head + "点" + tail;
}

/** A decimal read digit by digit after the point: 3.14 → "three point one four". */
export function enDecimal(value: number): string {
	const [whole, fraction] = String(Math.abs(value)).split(".");
	const sign = value < 0 ? "negative " : "";
	const head = whole ? enInteger(Number(whole)) : "zero";
	const tail = (fraction ?? "").split("").map((d) => EN_ONES[Number(d)] ?? d).join(" ");
	return sign + head + " point " + tail;
}

function speakAmount(amount: number, zh: boolean): string {
	if (Number.isInteger(amount)) return zh ? zhInteger(amount) : enInteger(amount);
	return zh ? zhDecimal(amount) : enDecimal(amount);
}

function expandMatch(match: string, locale: SpeechNumberLocale): string {
	const zh = locale === "zh";
	const isoDate = /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(match);
	if (isoDate) {
		const year = Number(isoDate[1]);
		const month = Number(isoDate[2]);
		const day = Number(isoDate[3]);
		if (month < 1 || month > 12 || day < 1 || day > 31) return match;
		if (zh) return zhYear(year) + "年" + zhInteger(month) + "月" + zhInteger(day) + "日";
		return EN_MONTHS[month - 1]! + " " + EN_ORDINALS[day]! + ", " + enYear(year);
	}
	const zhYearMatch = /^(\d{4})\s*年(?:\s*(\d{1,2})\s*月)?(?:\s*(\d{1,2})\s*日)?$/.exec(match);
	if (zhYearMatch) {
		const year = Number(zhYearMatch[1]);
		const month = zhYearMatch[2] ? Number(zhYearMatch[2]) : undefined;
		const day = zhYearMatch[3] ? Number(zhYearMatch[3]) : undefined;
		if (month !== undefined && (month < 1 || month > 12)) return match;
		if (day !== undefined && (day < 1 || day > 31)) return match;
		let out = zhYear(year) + "年";
		if (month !== undefined) out += zhInteger(month) + "月";
		if (day !== undefined) out += zhInteger(day) + "日";
		return out;
	}
	const zhMonthMatch = /^(\d{1,2})\s*月(?:\s*(\d{1,2})\s*日)?$/.exec(match);
	if (zhMonthMatch) {
		const month = Number(zhMonthMatch[1]);
		if (month < 1 || month > 12) return match;
		let out = zhInteger(month) + "月";
		if (zhMonthMatch[2]) {
			const day = Number(zhMonthMatch[2]);
			if (day < 1 || day > 31) return match;
			out += zhInteger(day) + "日";
		}
		return out;
	}
	const clock = /^(\d{1,2}):(\d{2})$/.exec(match);
	if (clock) {
		const hour = Number(clock[1]);
		const minute = Number(clock[2]);
		if (hour > 23 || minute > 59) return match;
		if (zh) {
			const h = hour === 0 ? "零点" : zhInteger(hour) + "点";
			return minute === 0 ? h + "整" : h + zhInteger(minute) + "分";
		}
		const twelve = hour % 12 === 0 ? 12 : hour % 12;
		const base = EN_ONES[twelve]!;
		if (minute === 0) return base + " o'clock";
		return base + " " + enMinute(minute);
	}
	const currency = /^([$\u00a5\u20ac\u00a3])\s*(\d+(?:\.\d+)?)$/.exec(match);
	if (currency) {
		const symbol = currency[1]!;
		const amount = Number(currency[2]);
		const unit = symbol === "$" ? (zh ? "美元" : "dollars")
			: symbol === "\u00a5" ? (zh ? "元" : "yuan")
				: symbol === "\u20ac" ? (zh ? "欧元" : "euros")
					: (zh ? "英镑" : "pounds");
		const spoken = speakAmount(amount, zh);
		return zh ? spoken + unit : spoken + " " + unit;
	}
	const percent = /^(\d+(?:\.\d+)?)\s*%$/.exec(match);
	if (percent) {
		const spoken = speakAmount(Number(percent[1]), zh);
		return zh ? "百分之" + spoken : spoken + " percent";
	}
	if (/^\d+\.\d+$/.test(match)) return speakAmount(Number(match), zh);
	if (/^\d+$/.test(match)) {
		const amount = Number(match);
		if (!Number.isSafeInteger(amount)) return match;
		return speakAmount(amount, zh);
	}
	return match;
}

/** Expand every number, date, time, percentage and currency amount in the
 *  text into words. Unrecognised forms are returned unchanged. */
export function expandNumbersForSpeech(text: string, locale: SpeechNumberLocale): string {
	if (!text) return text;
	if (!/[0-9]/.test(text)) return text;
	return text.replace(PATTERN, (match) => expandMatch(match, locale));
}
