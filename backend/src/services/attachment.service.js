const { createHash, randomUUID } = require('node:crypto');
const fs = require('node:fs/promises');
const path = require('node:path');
const httpError = require('../utils/httpError');

const uploadDirectory = path.resolve(__dirname, '..', '..', 'uploads');
const extensions = { 'application/pdf': '.pdf', 'image/jpeg': '.jpg', 'image/png': '.png' };

async function persistAttachments(files) {
  await fs.mkdir(uploadDirectory, { recursive: true, mode: 0o700 });
  const stored = [];
  try {
    for (const file of files || []) {
      const storageName = `${randomUUID()}${extensions[file.mimetype]}`;
      const storagePath = path.join(uploadDirectory, storageName);
      const originalName = path.basename(file.originalname)
        .replace(/[\u0000-\u001f\u007f]/g, '')
        .slice(0, 255) || 'attachment';
      await fs.writeFile(storagePath, file.buffer, { flag: 'wx', mode: 0o600 });
      stored.push({
        originalName,
        storageName,
        storagePath,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        sha256: createHash('sha256').update(file.buffer).digest('hex')
      });
    }
    return stored;
  } catch (error) {
    await removeAttachments(stored);
    throw error;
  }
}

async function removeAttachments(attachments) {
  await Promise.all((attachments || []).map((attachment) => fs.unlink(attachment.storagePath).catch((error) => {
    if (error.code !== 'ENOENT') throw error;
  })));
}

async function getAttachmentPath(grievanceId, attachmentId, user) {
  const { findAccessibleGrievance } = require('./grievance.service');
  await findAccessibleGrievance(grievanceId, user);
  const { pool } = require('../config/database');
  const result = await pool.query(
    `SELECT id, original_name, storage_name, mime_type
     FROM grievance_attachments WHERE id = $1 AND grievance_id = $2`,
    [attachmentId, grievanceId]
  );
  if (!result.rows[0]) throw httpError(404, 'ATTACHMENT_NOT_FOUND', 'Attachment not found.');
  return { ...result.rows[0], path: path.join(uploadDirectory, path.basename(result.rows[0].storage_name)) };
}

module.exports = { persistAttachments, removeAttachments, getAttachmentPath };
