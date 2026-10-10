const authService = require('../services/auth.service');

async function register(req, res, next) {
  try {
    const result = await authService.register(req.body, req.id);
    return res.status(201).json(result);
  } catch (error) {
    return next(error);
  }
}

async function login(req, res, next) {
  try {
    const result = await authService.login(req.body);
    return res.status(200).json(result);
  } catch (error) {
    return next(error);
  }
}

function me(req, res) {
  return res.json({ user: req.user });
}

module.exports = { register, login, me };
