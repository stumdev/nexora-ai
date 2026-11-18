import { defineConfig } from '@playwright/test';
import os from 'node:os';
import path from 'node:path';

// Teste de ponta a ponta da web com um servidor falso da Groq (não gasta sua cota).
const home = path.join(os.tmpdir(), 'nexora-e2e-home');
const work = path.join(os.tmpdir(), 'nexora-e2e-work');

export default defineConfig({
  testDir: 'e2e',
  timeout: 60_000,
  workers: 1,
  use: {
    baseURL: 'http://localhost:4181',
    // usa o Edge/Chrome já instalado (sem baixar navegador)
    channel: process.env.PW_CHANNEL ?? (process.platform === 'win32' ? 'msedge' : 'chrome'),
  },
  webServer: [
    { command: 'node e2e/mock-groq.mjs 4999', port: 4999, reuseExistingServer: false },
    {
      command: `node e2e/start-web.mjs`,
      url: 'http://localhost:4181/api/state',
      reuseExistingServer: false,
      env: { NEXORA_HOME: home, NEXORA_WORK: work, GROQ_API_KEY: 'mock', GROQ_BASE_URL: 'http://127.0.0.1:4999' },
    },
  ],
});
