// Sobe "nexora web" numa pasta de trabalho temporária e limpa (usado pelos testes E2E).
import fs from 'node:fs';
import path from 'node:path';
import { spawn } from 'node:child_process';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
for (const dir of [process.env.NEXORA_HOME, process.env.NEXORA_WORK]) {
  fs.rmSync(dir, { recursive: true, force: true });
  fs.mkdirSync(dir, { recursive: true });
}
const child = spawn(process.execPath, [path.join(root, 'cli/bin/nexora.js'), 'web', '--no-open', '--port', '4181'], {
  cwd: process.env.NEXORA_WORK,
  stdio: 'inherit',
  env: process.env,
});
const stop = () => child.kill();
process.on('SIGINT', stop);
process.on('SIGTERM', stop);
child.on('exit', (code) => process.exit(code ?? 0));
