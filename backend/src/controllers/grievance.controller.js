const grievanceService = require('../services/grievance.service');
const routingService = require('../services/routing.service');
const attachmentService = require('../services/attachment.service');
const statusService = require('../services/status.service');

async function create(req, res, next) {
  let attachments = [];
  try {
    attachments = await attachmentService.persistAttachments(req.files);
    const grievance = await grievanceService.createGrievance(req.body, req.user, req.id, attachments);
    return res.status(201).json({ grievance });
  } catch (error) {
    try {
      await attachmentService.removeAttachments(attachments);
    } catch (cleanupError) {
      const logger = require('../config/logger');
      logger.error({ event: 'attachment_cleanup_failed', requestId: req.id, errorCode: cleanupError.code || cleanupError.name });
    }
    return next(error);
  }
}

async function list(req, res, next) {
  try {
    return res.json(await grievanceService.listGrievances(req.user, req.validatedQuery));
  } catch (error) {
    return next(error);
  }
}

async function get(req, res, next) {
  try {
    return res.json({ grievance: await grievanceService.findAccessibleGrievance(req.params.id, req.user) });
  } catch (error) {
    return next(error);
  }
}

async function update(req, res, next) {
  try {
    const grievance = await grievanceService.updateGrievance(
      req.params.id,
      req.body,
      req.user,
      req.id
    );
    return res.json({ grievance });
  } catch (error) {
    return next(error);
  }
}

async function history(req, res, next) {
  try {
    return res.json({ history: await grievanceService.getHistory(req.params.id, req.user) });
  } catch (error) {
    return next(error);
  }
}

async function track(req, res, next) {
  try {
    return res.json({ tracking: await grievanceService.trackGrievance(req.params.trackingId) });
  } catch (error) {
    return next(error);
  }
}

async function classify(req, res, next) {
  try {
    const classification = await routingService.classifyGrievance(req.params.id, req.user, req.id);
    return res.json({ classification });
  } catch (error) {
    return next(error);
  }
}

async function route(req, res, next) {
  try {
    return res.json({
      routing: await routingService.routeGrievance(req.params.id, req.user, req.id, req.body?.reviewReason)
    });
  } catch (error) {
    return next(error);
  }
}

async function routing(req, res, next) {
  try {
    return res.json({ routing: await routingService.getRouting(req.params.id, req.user) });
  } catch (error) {
    return next(error);
  }
}

async function reassign(req, res, next) {
  try {
    return res.json({
      assignment: await routingService.reassign(
        req.params.id,
        req.body.departmentId,
        req.body.reason,
        req.user,
        req.id
      )
    });
  } catch (error) {
    return next(error);
  }
}

async function downloadAttachment(req, res, next) {
  try {
    const attachment = await attachmentService.getAttachmentPath(
      req.params.id,
      req.params.attachmentId,
      req.user
    );
    res.set('X-Content-Type-Options', 'nosniff');
    return res.download(attachment.path, attachment.original_name, { headers: { 'Content-Type': attachment.mime_type } });
  } catch (error) {
    return next(error);
  }
}

async function updateStatus(req, res, next) {
  try {
    const result = await statusService.transitionGrievance(
      req.params.id,
      req.body.status,
      req.user,
      req.body.explanation,
      req.id
    );
    return res.json({ grievance: result });
  } catch (error) {
    return next(error);
  }
}

module.exports = {
  create, list, get, update, history, track, classify, route, routing, reassign, downloadAttachment, updateStatus
};
