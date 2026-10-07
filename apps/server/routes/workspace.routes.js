'use strict';

const { Router } = require('express');
const workspaceController = require('../controllers/workspace.controller');
const { parseSession, requireAdmin } = require('../middleware/auth.middleware');
const { attachProjectRef, requireProjectRef } = require('../middleware/project-ref.middleware');

const router = Router();

function requireWorkspaceProjectAccess(req, res, next) {
  const callerProjectRef = req.user?.projectRef ?? req.user?.project_ref ?? null;
  if (!callerProjectRef || String(callerProjectRef).toLowerCase() !== String(req.projectRef || '').toLowerCase()) {
    return res.status(403).json({ error: 'Access denied' });
  }
  return next();
}

router.use(
  parseSession,
  requireAdmin,
  attachProjectRef,
  requireProjectRef,
  requireWorkspaceProjectAccess
);

router.get('/:projectRef',          workspaceController.getWorkspace);
router.patch('/:projectRef',        workspaceController.updateWorkspace);
router.get('/:projectRef/blocks',   workspaceController.getBlockContent);
router.post('/:projectRef/blocks',  workspaceController.saveBlockContent);

module.exports = router;
