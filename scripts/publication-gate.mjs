// Publication gate: fails when a file that would be published looks like a secret, a credential file, a private
// asset or build output, when required license notices are missing, or when a GitHub link points anywhere other than
// the repository declared in package.json "repository". Generic by design: it carries no project-specific blocklist.
// Usage: node scripts/publication-gate.mjs [root]
import { execFileSync } from "node:child_process";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";

const root = process.argv[2] ?? process.cwd();
const skipDirectories = new Set(["node_modules", ".git", "dist", "dist-node", "test-results", "playwright-report", "coverage"]);

function walk(directory) {
  return readdirSync(directory).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(path).isDirectory()) return skipDirectories.has(name) ? [] : walk(path);
    return [relative(root, path)];
  });
}

// Prefer what git would publish; fall back to a filesystem walk when the tree is not a repository yet.
function publishedFiles() {
  try {
    return execFileSync("git", ["ls-files", "-co", "--exclude-standard"], { cwd: root, encoding: "utf8", stdio: ["ignore", "pipe", "ignore"] }).split("\n").filter(Boolean);
  } catch {
    return walk(root);
  }
}

const forbiddenPaths = [
  /(^|\/)\.env($|\.)/, /(^|\/)\.npmrc$/, /(^|\/)\.pypirc$/, /(^|\/)\.netrc$/, /(^|\/)id_(rsa|dsa|ecdsa|ed25519)(\.pub)?$/,
  /\.(pem|key|p12|pfx|jks|keystore|sqlite3?|db|log|har)$/i, /(^|\/)\.DS_Store$/, /(^|\/)(dist|dist-node|coverage|node_modules)\//,
  /\.(js|css)\.map$/, /^brand\//,
];
const secretPatterns = [
  /-----BEGIN [A-Z ]*PRIVATE KEY-----/, /\b(AKIA|ASIA)[0-9A-Z]{16}\b/, /\b(ghp|gho|ghu|ghs|ghr)_[A-Za-z0-9]{36}\b/, /\bgithub_pat_[A-Za-z0-9_]{50,}\b/,
  /\bxox[abprs]-[A-Za-z0-9-]{10,}\b/, /\bsk-(ant-)?[A-Za-z0-9_-]{20,}\b/, /\bAIza[0-9A-Za-z_-]{35}\b/, /\b(sk|rk)_live_[0-9A-Za-z]{16,}\b/,
  /\beyJ[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{10,}\.[A-Za-z0-9_-]{5,}\b/, /[a-z][a-z0-9+.-]*:\/\/[^\s/:@'"]+:[^\s/@'"]+@/,
  /(?:\/Users|\/home)\/(?!user\b)[A-Za-z0-9._-]+\//,
];
const requiredFiles = ["LICENSE", "TRADEMARKS.md", "README.md"];

const files = publishedFiles();
const failures = [];
for (const required of requiredFiles) if (!files.includes(required)) failures.push(`missing required file: ${required}`);

const manifest = JSON.parse(readFileSync(join(root, "package.json"), "utf8"));
const repository = typeof manifest.repository === "string" ? manifest.repository : manifest.repository?.url;
const declared = repository?.match(/github\.com[/:]([^/]+\/[^/.]+)/)?.[1];
if (declared === undefined) failures.push("package.json must declare the public GitHub repository");

for (const file of files) {
  if (forbiddenPaths.some((pattern) => pattern.test(file))) failures.push(`forbidden path: ${file}`);
  if (/\.(png|jpe?g|gif|webp|ico|woff2?|ttf|otf)$/i.test(file)) continue;
  const text = readFileSync(join(root, file), "utf8");
  text.split("\n").forEach((line, index) => {
    // Report the rule only, never the matched value.
    secretPatterns.forEach((pattern, rule) => {
      if (pattern.test(line)) failures.push(`secret-like pattern #${rule.toString()}: ${file}:${(index + 1).toString()}`);
    });
    for (const match of line.matchAll(/github\.com\/([A-Za-z0-9-]+\/[A-Za-z0-9._-]+)/g)) {
      const linked = match[1].replace(/\.git$/, "");
      if (linked !== declared) failures.push(`link to undeclared repository ${linked}: ${file}:${(index + 1).toString()}`);
    }
  });
}

if (failures.length > 0) {
  console.error(`publication gate: ${failures.length.toString()} problem(s)\n${failures.map((failure) => `  ${failure}`).join("\n")}`);
  process.exit(1);
}
console.log(`publication gate: ${files.length.toString()} files checked, no problems`);
