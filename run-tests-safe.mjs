/** 安全测试运行器 v2
 *  教训：v1 用 3-6GB 堆上限，在 8.5GB 内存的机器上和 dev server 竞争，触发 OOM
 *  杀掉了宿主进程。v2 改用 1.5GB 上限、单文件独立进程、串行执行、每文件后释放。
 *
 *  用法: node run-tests-safe.mjs [起始] [结束]
 */
import { spawnSync } from "node:child_process";
import { readdirSync, appendFileSync, writeFileSync } from "node:fs";

const LOG = "test-progress.txt";
writeFileSync(LOG, "");   // 每次运行重写

const files = readdirSync("tests").filter(f => /\.test\.(ts|tsx)$/.test(f)).sort();
const start = Number(process.argv[2] ?? 0);
const end = Number(process.argv[3] ?? files.length);
const slice = files.slice(start, end);

console.log(`${slice.length} 个文件 | 堆上限 1.5GB | 单文件超时 120s`);

let pass = 0, fail = 0, timeout = 0;
const fails = [], timeouts = [];

for (let i = 0; i < slice.length; i++) {
  const f = slice[i];
  const t0 = Date.now();
  const r = spawnSync(process.execPath, [
    "node_modules/tsx/dist/cli.mjs", "--test", "tests/" + f,
  ], {
    env: { ...process.env, NODE_ENV: "test", NODE_OPTIONS: "--max-old-space-size=1536" },
    encoding: "utf8", maxBuffer: 32 * 1024 * 1024, timeout: 120000, killSignal: "SIGKILL",
    windowsHide: true,
  });
  const out = (r.stdout || "") + (r.stderr || "");
  const p = (out.match(/^✔ /gm) || []).length;
  const fl = (out.match(/^✖ /gm) || []).length;
  const secs = ((Date.now() - t0) / 1000).toFixed(1);
  const killed = r.signal === "SIGKILL" || r.error?.code === "ETIMEDOUT";
  const oom = /out of memory/i.test(out);

  if (killed) { timeout++; timeouts.push(f); console.log(`[TIMEOUT ${secs}s] ${f}`); }
  else if (fl > 0) { fail += fl; fails.push(f); console.log(`[FAIL ${fl}] ${f} (${secs}s)`); }
  else { pass += p; }

  appendFileSync(LOG, `${f}\t${p}\t${fl}\t${killed ? "TIMEOUT" : oom ? "OOM" : "ok"}\t${secs}s\n`);
  if ((i + 1) % 25 === 0) console.log(`  -- 进度 ${i + 1}/${slice.length} --`);
}

console.log(`\n=== 结果: 通过 ${pass} / 失败 ${fail} / 超时 ${timeout} ===`);
if (fails.length) { console.log("\n失败:"); fails.forEach(f => console.log("  " + f)); }
if (timeouts.length) { console.log("\n超时:"); timeouts.forEach(f => console.log("  " + f)); }
