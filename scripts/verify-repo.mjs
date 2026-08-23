import { access, readFile } from 'node:fs/promises';

const required = [
  'README.md',
  'docs/BUILD_SPECIFICATION.md',
  'docs/ARCHITECTURE.md',
  'apps/backoffice-web/README.md',
  'apps/backoffice-api/README.md',
  'services/provider-orchestrator/README.md',
  'services/reconciliation-service/README.md',
  'services/webhook-gateway/README.md',
  'adapters/native-vending/README.md',
  'adapters/cpay/README.md',
  'packages/provider-sdk/README.md',
  'packages/canonical-models/README.md',
  '.env.example'
];

for (const path of required) await access(path);

const env = await readFile('.env.example', 'utf8');
if (/sk-[A-Za-z0-9_-]{10,}|-----BEGIN (RSA |EC )?PRIVATE KEY-----/.test(env)) {
  throw new Error('Potential secret detected in .env.example');
}

console.log(`Repository bootstrap verified: ${required.length} required paths present.`);
