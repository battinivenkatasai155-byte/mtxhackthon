const clusterService = require('../services/clustering.service');

async function list(req, res, next) {
  try {
    return res.json({ clusters: await clusterService.list() });
  } catch (error) {
    return next(error);
  }
}

async function get(req, res, next) {
  try {
    return res.json({ cluster: await clusterService.get(req.params.id) });
  } catch (error) {
    return next(error);
  }
}

async function analyze(req, res, next) {
  try {
    const cluster = await clusterService.analyze(req.body.grievanceIds, req.user, req.id);
    return res.status(201).json({ cluster });
  } catch (error) {
    return next(error);
  }
}

async function review(req, res, next) {
  try {
    const cluster = await clusterService.review(
      req.params.id,
      req.body.state,
      req.body.reason,
      req.user,
      req.id
    );
    return res.json({ cluster });
  } catch (error) {
    return next(error);
  }
}

async function grievances(req, res, next) {
  try {
    return res.json({ grievances: await clusterService.getGrievances(req.params.id) });
  } catch (error) {
    return next(error);
  }
}

async function addMember(req, res, next) {
  try {
    const member = await clusterService.addMember(
      req.params.id,
      req.body.grievanceId,
      req.user,
      req.id
    );
    return res.status(201).json({ member });
  } catch (error) {
    return next(error);
  }
}

async function removeMember(req, res, next) {
  try {
    return res.json({
      member: await clusterService.removeMember(
        req.params.id,
        req.params.grievanceId,
        req.user,
        req.id
      )
    });
  } catch (error) {
    return next(error);
  }
}

module.exports = { list, get, analyze, review, grievances, addMember, removeMember };
