// Type-check index.ts against the installed Pi. Pi's extension loader resolves
// "@earendil-works/pi-ai" to the compatibility API that ships inside Pi, so the
// same file is located here (matching index.test.mjs) whatever the package
// manager's node_modules layout looks like.
import { existsSync, mkdtempSync, writeFileSync } from "node:fs";
import { createRequire } from "node:module";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { spawnSync } from "node:child_process";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const piRequire = createRequire(import.meta.resolve("@earendil-works/pi-coding-agent"));
const piAi = piRequire.resolve.paths("@earendil-works/pi-ai")
	.map((path) => join(path, "@earendil-works/pi-ai/dist/compat.d.ts")).find(existsSync);
if (!piAi) throw new Error("Pi's installed pi-ai package must be available");
const config = join(mkdtempSync(join(tmpdir(), "jev-typecheck-")), "tsconfig.json");
writeFileSync(config, JSON.stringify({
	extends: join(root, "tsconfig.json"),
	compilerOptions: { baseUrl: root, typeRoots: [join(root, "node_modules/@types")], paths: { "@earendil-works/pi-ai": [piAi] } },
	files: [join(root, "index.ts")],
}));
const result = spawnSync(process.execPath, [join(root, "node_modules/typescript/bin/tsc"), "-p", config], { stdio: "inherit" });
process.exit(result.status ?? 1);
