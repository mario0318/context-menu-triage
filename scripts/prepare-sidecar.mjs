// Copies the built Node single-file executable into the Tauri sidecar location,
// named with the Rust host target triple as Tauri's externalBin requires.
import { execFileSync } from 'node:child_process';
import { copyFileSync, existsSync, mkdirSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const source = join(root, 'dist', 'context-menu-triage.exe');
if (!existsSync(source)) {
  console.error('Missing dist/context-menu-triage.exe — run `npm run build:exe` first.');
  process.exit(1);
}

let triple;
try {
  const out = execFileSync('rustc', ['-vV'], { encoding: 'utf8' });
  triple = (out.match(/host:\s*(\S+)/) || [])[1];
} catch {
  triple = 'x86_64-pc-windows-msvc';
}
if (!triple) triple = 'x86_64-pc-windows-msvc';

const destDir = join(root, 'src-tauri', 'binaries');
mkdirSync(destDir, { recursive: true });
const dest = join(destDir, `context-menu-triage-${triple}.exe`);
copyFileSync(source, dest);
console.log(`sidecar ready: ${dest}`);
