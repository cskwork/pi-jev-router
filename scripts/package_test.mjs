// Packaged-install smoke test: the npm tarball must contain every file the
// extension imports at runtime, not just what the checkout happens to have.
import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";
import { dirname, join, normalize } from "node:path";
import { fileURLToPath } from "node:url";
import test from "node:test";

const root = join(dirname(fileURLToPath(import.meta.url)), "..");
const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));

function packedFiles() {
	const output = execFileSync("npm", ["pack", "--dry-run", "--json", "--ignore-scripts"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] });
	const [tarball] = JSON.parse(output);
	return new Set(tarball.files.map((file) => file.path));
}

function localImports(file, seen = new Set()) {
	if (seen.has(file)) return seen;
	seen.add(file);
	if (!/\.(?:ts|mjs|js)$/.test(file)) return seen;
	const source = readFileSync(join(root, file), "utf8");
	for (const match of source.matchAll(/^\s*(?:import|export)\b[^"'\n]*?from\s*["'](\.{1,2}\/[^"']+)["']|^\s*import\s*["'](\.{1,2}\/[^"']+)["']/gm)) {
		localImports(normalize(join(dirname(file), match[1] ?? match[2])), seen);
	}
	return seen;
}

test("npm tarball includes the extension entry, its local imports, docs, and the Laya bridge", () => {
	const files = packedFiles();
	for (const entry of manifest.pi.extensions) assert.ok(files.has(normalize(entry)), `${entry} must be packed`);
	for (const file of localImports(normalize(manifest.pi.extensions[0]))) assert.ok(files.has(file), `${file} is imported by the extension but not packed`);
	for (const required of ["package.json", "README.md", "README.en.md", "LICENSE", "scripts/laya-server.py"]) assert.ok(files.has(required), `${required} must be packed`);
	for (const file of files) assert.doesNotMatch(file, /\.test\.|_test\.py|\.playwright-cli|\.superdesign/, `${file} must not be published`);
});

test("package metadata stays consistent with the release workflow", () => {
	assert.match(manifest.version, /^\d+\.\d+\.\d+$/);
	assert.equal(manifest.name, "pi-router-jev");
	const changelog = readFileSync(join(root, "CHANGELOG.md"), "utf8");
	assert.ok(changelog.includes(`## ${manifest.version} `), `CHANGELOG.md must have an entry for ${manifest.version}`);
});
