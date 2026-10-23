'use strict';

// Development/CI guard. Vercel's managed production runtime is checked separately.
const [major, minor, patch] = process.versions.node.split('.').map(Number);
const supported = major === 24 && (minor > 22 || (minor === 22 && patch >= 1));
if (!supported) {
  console.error(`Unsupported development/build Node ${process.version}. Use patched Node 24.22.1 or later in the 24.x line. On Windows, run scripts/dev-node.ps1.`);
  process.exitCode = 1;
} else {
  console.log(`Development/build runtime verified: Node ${process.version} (minimum 24.22.1).`);
}
