import test from "node:test";
import assert from "node:assert/strict";
import {
	detectSpeechLocale,
	enInteger,
	expandNumbersForSpeech,
	zhInteger,
} from "../src/core/speech-numbers.ts";

test("chinese integers read as mandarin numerals", () => {
	assert.equal(zhInteger(0), "零");
	assert.equal(zhInteger(10), "十");
	assert.equal(zhInteger(11), "十一");
	assert.equal(zhInteger(105), "一百零五");
	assert.equal(zhInteger(1000), "一千");
	assert.equal(zhInteger(10000), "一万");
	assert.equal(zhInteger(10010), "一万零一十");
	assert.equal(zhInteger(1234567), "一百二十三万四千五百六十七");
});

test("english integers read as number words", () => {
	assert.equal(enInteger(0), "zero");
	assert.equal(enInteger(7), "seven");
	assert.equal(enInteger(15), "fifteen");
	assert.equal(enInteger(105), "one hundred five");
	assert.equal(enInteger(1000), "one thousand");
	assert.equal(enInteger(1234567), "one million two hundred thirty-four thousand five hundred sixty-seven");
});

test("the reading locale follows the dominant script", () => {
	assert.equal(detectSpeechLocale("hello world"), "en");
	assert.equal(detectSpeechLocale("你好世界"), "zh");
	assert.equal(detectSpeechLocale("你好 world"), "zh");
});

test("a chinese year reads digit by digit", () => {
	assert.equal(expandNumbersForSpeech("2024年", "zh"), "二零二四年");
});

test("a chinese date expands month and day", () => {
	assert.equal(expandNumbersForSpeech("2024年3月5日", "zh"), "二零二四年三月五日");
});

test("an iso date expands per locale", () => {
	assert.equal(expandNumbersForSpeech("2024-03-05", "zh"), "二零二四年三月五日");
	assert.equal(expandNumbersForSpeech("2024-03-05", "en"), "March fifth, twenty twenty-four");
});

test("a clock expands per locale", () => {
	assert.equal(expandNumbersForSpeech("14:30", "zh"), "十四点三十分");
	assert.equal(expandNumbersForSpeech("14:30", "en"), "two thirty");
});

test("percentages and currency expand", () => {
	assert.equal(expandNumbersForSpeech("50%", "zh"), "百分之五十");
	assert.equal(expandNumbersForSpeech("50%", "en"), "fifty percent");
	assert.equal(expandNumbersForSpeech("$50", "en"), "fifty dollars");
	assert.equal(expandNumbersForSpeech("¥50", "zh"), "五十元");
});

test("a decimal reads digit by digit after the point", () => {
	assert.equal(expandNumbersForSpeech("3.14", "zh"), "三点一四");
	assert.equal(expandNumbersForSpeech("3.14", "en"), "three point one four");
});

test("an out-of-range month is left exactly as written", () => {
	assert.equal(expandNumbersForSpeech("2024-13-05", "zh"), "2024-13-05");
});

test("text without digits is returned unchanged", () => {
	const text = "这是一段没有数字的文字。";
	assert.equal(expandNumbersForSpeech(text, "zh"), text);
});
