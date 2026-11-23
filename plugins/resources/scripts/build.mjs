import * as fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";
import { build } from "esbuild";

const root = fileURLToPath(new URL("../", import.meta.url));
const output = path.join(root, "dist");
try {
  if (fs.lstatSync(output).isSymbolicLink()) throw new Error("Refusing to build into a linked directory.");
  try { fs.lstatSync(path.join(output, "data")); throw new Error("Refusing to build over plugin data. Move it to a safe location first."); }
  catch (error) { if (error.code !== "ENOENT") throw error; }
} catch (error) { if (error.code !== "ENOENT") throw error; }
fs.rmSync(output, { recursive: true, force: true });
fs.mkdirSync(output, { recursive: true });

await Promise.all([
  build({
    absWorkingDir: root,
    entryPoints: ["src/main.ts"],
    outfile: path.join(output, "main.js"),
    bundle: true,
    format: "esm",
    platform: "browser",
    target: "es2022",
    minify: false,
    legalComments: "eof",
  }),
  build({
    absWorkingDir: root,
    entryPoints: ["src/backend.cjs"],
    outfile: path.join(output, "backend.cjs"),
    bundle: true,
    format: "cjs",
    platform: "node",
    target: "node20",
  }),
]);

for (const [from, to] of [["manifest.json", "manifest.json"], ["src/styles.css", "styles.css"], ["README.md", "README.md"], ["LICENSE", "LICENSE"]]) {
  fs.copyFileSync(path.join(root, from), path.join(output, to));
}
console.log(`Built resources plugin: ${output}`);
