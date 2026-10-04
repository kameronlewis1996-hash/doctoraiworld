'use strict';
const { spawnSync } = require('node:child_process');
for (const script of ['verify-medication-database.cjs', 'verify-local-medication-ui.cjs', 'verify-retired-medication-providers.cjs']) {
  const result = spawnSync(process.execPath, [`scripts/${script}`], { stdio: 'inherit' });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status || 1);
}
