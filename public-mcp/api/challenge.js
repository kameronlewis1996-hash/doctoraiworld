'use strict';

module.exports = function challenge(req, res) {
  if (req.method !== 'GET' && req.method !== 'HEAD') {
    res.setHeader('Allow', 'GET, HEAD');
    res.status(405).end();
    return;
  }

  const token = process.env.OPENAI_APPS_CHALLENGE_TOKEN;
  if (!token || !/^[A-Za-z0-9._~-]{16,256}$/.test(token)) {
    res.status(404).end();
    return;
  }

  res.setHeader('Content-Type', 'text/plain; charset=utf-8');
  res.setHeader('Cache-Control', 'no-store');
  res.status(200).send(token);
};
