/** Plugin UI localization (zh-CN i18n wave).
 *
 *  Plugins are bundled independently and cannot import the host's next-intl
 *  catalogs. The active UI language reaches them through the document —
 *  the host sets <html lang> from the settings record — so this module
 *  reads that once per call and resolves a small plugin-local dictionary.
 *
 *  Design rules:
 *  - English strings are the source of truth for keys: `t("Reveal answer")`
 *    looks up the exact English text. That keeps every existing call site
 *    readable and means a missing translation degrades to English rather
 *    than to a key.
 *  - Unknown strings pass through unchanged (never "undefined").
 *  - No build step, no async, no host API needed.
 */

const ZH = {
	"Learning": "学习中",
	"Relearning": "重学中",
	"Spaced repetition": "间隔重复",
	"Loading statistics…": "正在加载统计…",
	"Current states": "当前状态",
	"Active propositions with at least one cue.": "至少有一条提示的活跃命题。",
	"Scheduled due": "计划到期",
	"Current scheduled due dates.": "当前计划到期日期。",
	"Scheduled reviews": "计划复习",
	"Scheduled review ratings recorded each day.": "每天记录的计划复习评分。",
	"Overdue": "已逾期",
	"No data available.": "暂无数据。",
	"Deck settings": "牌组设置",
	"Move up": "上移",
	"Move down": "下移",
	"Deck name": "牌组名称",
	"Create card": "新建卡片",
	"Add cue": "添加提示",
	"Proposition": "命题",
	"Archive": "归档",
	"Rename deck": "重命名牌组",
	"Flashcards library": "记忆卡片库",
	"Propositions": "命题",
	"New today": "今日新增",
	"No matching flashcards.": "没有匹配的记忆卡片。",
	"No flashcards yet. Pick knowledge or upload a file above to generate your first cues.": "还没有记忆卡片。在上方选择知识点或上传文件，即可生成第一批提示。",
	"Flashcard practice": "记忆卡片练习",
	"Practice mode does not change your review schedule.": "练习模式不会改变你的复习计划。",
	"Practice complete.": "练习完成。",
	"Reveal answer": "显示答案",
	"Retry next card": "重试下一张",
	"Loading next card…": "正在加载下一张…",
	"No cards due in this selection.": "此范围内没有到期的卡片。",
	"Delete deck": "删除牌组",
	"Delete card": "删除卡片",
	"Generate": "生成",
	"Generating…": "生成中…",
	"Cancel": "取消",
	"Save": "保存",
	"Delete": "删除",
	"Close": "关闭",
	"Search": "搜索",
	"Loading…": "加载中…",
	"Flashcards": "记忆卡片",
	"Decks…": "牌组…",
	"Search decks, propositions, and cues": "搜索牌组、命题与提示",
	"Delete selected": "删除所选",
	"Converting file…": "正在转换文件…",
	"Preparing generation…": "正在准备生成…",
	"Desired retention (%)": "期望记忆保持率（%）",
	"Learning steps (minutes)": "学习步骤（分钟）",
	"Relearning steps (minutes)": "重学步骤（分钟）",
	"Day starts at (hour)": "每日起始时间（小时）",
	"Generation chunk budget (estimated tokens)": "生成分块预算（估算 token 数）",
	"Model": "模型",
	"Follow cheap slot": "跟随「经济」槽位",
	"Generate flashcards": "生成记忆卡片",
	"Generate from file…": "从文件生成…",
	"Create deck": "新建牌组",
	"Review all": "复习全部",
	"Practice all": "练习全部",
	"Review selected": "复习所选",
	"Practice selected": "练习所选",
	"Clear": "清除",
	"Review": "复习",
	"New": "新卡",
	"New propositions per day": "每日新命题数",
	"Today": "今天",
	"{count} selected": "已选 {count} 项",
	"Name": "名称",
	"Due": "到期",
	"notes": "笔记",
	"No cards ready. Next due {when}.": "没有到期的卡片。下次到期：{when}。",
	"Start": "开始",
	"Question (Markdown)": "问题（Markdown）",
	"Answer (Markdown)": "答案（Markdown）",
	"Edit cue": "编辑提示",
	"Delete flashcards?": "删除记忆卡片？",
	"Edit": "编辑",
	"Deck memberships": "牌组成员关系",
	"Memberships share the same cues, schedule, and history. Keep at least one deck.": "成员关系共享相同的提示、复习计划与历史。至少保留一个牌组。",
	"Save memberships": "保存成员关系",
	"Delete deck…": "删除牌组…",
	"Choose a file for flashcards": "选择记忆卡片文件",
	"Decks": "牌组",
	"No flashcards were generated from this file.": "未能从该文件生成任何记忆卡片。",
	"Cancel generation": "取消生成",
	"Retry failed…": "重试失败项…",
	"Retry saving": "重试保存",
	"Chunk {id}: {error}": "分块 {id}：{error}"
};;

/** The active UI language as the host declares it. */
export function uiLocale() {
	const lang = typeof document !== "undefined" ? document.documentElement?.lang : "";
	return typeof lang === "string" && lang.toLowerCase().startsWith("zh") ? "zh-CN" : "en";
}

/** Translate one plugin string. English input is the key. */
export function t(text) {
	if (uiLocale() !== "zh-CN") return text;
	return ZH[text] ?? text;
}
