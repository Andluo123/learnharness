/**
 * THE teaching-language instruction (zh-CN i18n wave): appended to every
 * agent's composed system prompt so the model teaches in the user's UI
 * language.
 *
 * Why an APPENDED directive rather than translated prompt files: the
 * source prompts stay byte-identical to upstream (merges keep working),
 * the switch is per-turn and reversible, and a user who flips the UI
 * back to English immediately gets the English-teaching agent again.
 *
 * Composition order matters: the directive is appended LAST so it reads
 * as the most specific instruction in context.
 */

import type { AppLocale } from "../../i18n/config.ts";

/** The one-line directive per locale. English returns null: the prompt
 *  files are already English, so nothing needs appending. */
const DIRECTIVES: Record<AppLocale, string | null> = {
	en: null,
	"zh-CN": `# 教学语言

用简体中文教学。所有面向学习者的输出都使用简体中文：讲解、提问、反馈、练习题目、计划文本与总结。

- 专有名词、代码、公式、变量名、库名与 API 名称保持原文，不要翻译。
- 数学与计算机科学的通用术语首次出现时，可写作"中文（English term）"。
- 学习者用英文回答时，不要纠正或要求其改用中文；按其使用的语言理解即可。
- 内部推理可以使用任意语言，但最终写给学习者的内容必须是简体中文。`,
};

/** Append the directive for `locale` to an already-composed prompt.
 *
 *  UNDEFINED locale appends NOTHING: the switches-less composition path is
 *  pinned byte-identical by tests/prompt-overrides.test.ts, and callers that
 *  do not know the UI language must keep the upstream English prompt
 *  untouched. An explicit "en" also appends nothing (the prompts already
 *  ARE English). Only an explicit zh-CN adds the directive.
 */
export function withTeachingLanguage(instructions: string, locale: AppLocale | undefined): string {
	if (locale === undefined) return instructions;
	const directive = DIRECTIVES[locale];
	if (!directive) return instructions;
	return `${instructions}\n\n---\n\n${directive}`;
}
