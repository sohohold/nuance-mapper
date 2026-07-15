// TypeScript 7 compatibility shim for Next.js
// TS 7 removed typescript/lib/typescript.js. Next.js checks for this file
// to verify TypeScript is installed. This script creates a minimal shim
// so Next.js can detect TS 7 properly.
const fs = require("fs");
const path = require("path");

// Find the actual typescript package directory
let tsDir;
try {
  const tsPkgPath = require.resolve("typescript/package.json");
  tsDir = path.dirname(tsPkgPath);
} catch {
  process.exit(0); // typescript not installed, nothing to do
}

const shimPath = path.join(tsDir, "lib", "typescript.js");
if (!fs.existsSync(shimPath)) {
  const shimContent = [
    "// TS7 compat shim for tools expecting typescript/lib/typescript.js",
    'const pkg = require("../package.json");',
    "module.exports = { version: pkg.version, versionMajorMinor: pkg.versionMajorMinor };",
    "",
  ].join("\n");
  fs.mkdirSync(path.dirname(shimPath), { recursive: true });
  fs.writeFileSync(shimPath, shimContent);
}
