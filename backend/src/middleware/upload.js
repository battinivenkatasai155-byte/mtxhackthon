const multer = require('multer');
const httpError = require('../utils/httpError');

const allowed = {
  'application/pdf': '.pdf',
  'image/jpeg': '.jpg',
  'image/png': '.png'
};

const receiveAttachments = multer({
  storage: multer.memoryStorage(),
  limits: { fileSize: 5 * 1024 * 1024, files: 3, fields: 10 },
  fileFilter(req, file, callback) {
    const expectedExtension = allowed[file.mimetype];
    const extension = require('node:path').extname(file.originalname).toLowerCase();
    if (!expectedExtension || (file.mimetype === 'image/jpeg' && !['.jpg', '.jpeg'].includes(extension))
      || (file.mimetype !== 'image/jpeg' && extension !== expectedExtension)) {
      return callback(httpError(400, 'INVALID_ATTACHMENT_TYPE', 'Only PDF, JPEG, and PNG attachments are accepted.'));
    }
    return callback(null, true);
  }
}).array('attachments', 3);

function validateAttachmentContents(req, res, next) {
  const files = req.files || [];
  for (const file of files) {
    const bytes = file.buffer;
    const valid = file.mimetype === 'application/pdf'
      ? bytes.subarray(0, 5).toString('ascii') === '%PDF-'
      : file.mimetype === 'image/png'
        ? bytes.subarray(0, 8).equals(Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]))
        : bytes.length >= 3 && bytes[0] === 0xff && bytes[1] === 0xd8 && bytes[2] === 0xff;
    if (!valid) {
      return next(httpError(400, 'INVALID_ATTACHMENT_CONTENT', 'Attachment content does not match its declared file type.'));
    }
  }
  return next();
}

function parseMultipartFields(req, res, next) {
  if (typeof req.body?.location === 'string') {
    try {
      req.body.location = JSON.parse(req.body.location);
    } catch {
      return next(httpError(400, 'INVALID_LOCATION', 'Multipart location must be valid JSON.'));
    }
  }
  return next();
}

module.exports = { receiveAttachments, validateAttachmentContents, parseMultipartFields };
