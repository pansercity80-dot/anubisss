'use strict';
const { handle } = require('./_core');

module.exports = async (req, res) => {
  res.setHeader('Cache-Control', 'no-store');
  const out = await handle(req.query || {});
  res.status(out.code).json(out.json);
};
