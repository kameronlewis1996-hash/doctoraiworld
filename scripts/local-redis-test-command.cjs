'use strict';
const { execFile } = require('node:child_process');
const { promisify } = require('node:util');
const run = promisify(execFile);
function localRedisCommand(container) {
  if (!/^doctorai-redis-cas-[a-f0-9]{12}$/.test(container)) throw new Error('Only the dedicated ephemeral local test container is allowed.');
  return async args => {
    if (!Array.isArray(args) || !['EVAL', 'HGET', 'HVALS', 'HDEL', 'HSET', 'HSETNX'].includes(String(args[0]).toUpperCase())) throw new Error('Unsupported local test command.');
    const { stdout } = await run('docker', ['--config', '/tmp/doctorai-redis-docker-config', '--host', 'unix:///var/run/docker.sock', 'exec', '--user', '999:999', container, 'redis-cli', '-s', '/tmp/doctorai-redis.sock', '--json', ...args.map(String)], { timeout: 15000, maxBuffer: 1048576 });
    const result = JSON.parse(stdout.trim());
    if (result?.error) throw new Error('Local Redis command failed.');
    return result;
  };
}
module.exports = { localRedisCommand };
