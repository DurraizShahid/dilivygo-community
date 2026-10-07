'use strict';

const { select, insert, update, supabaseFetch } = require('../lib/supabase');
const { createError } = require('../middleware/error.middleware');
const { mapWorkspace } = require('../lib/case');

async function getWorkspace(req, res, next) {
  try {
    const rows = await select('workspaces', { filters: { project_ref: req.projectRef } });
    const workspace = rows?.[0];
    if (!workspace) return next(createError('Workspace not found', 404));
    return res.json({ workspace: mapWorkspace(workspace) });
  } catch (err) {
    next(err);
  }
}

async function updateWorkspace(req, res, next) {
  try {
    // Convert camelCase to snake_case for the update
    const updates = {};
    if (req.body.name !== undefined) updates.name = req.body.name;
    if (req.body.description !== undefined) updates.description = req.body.description;
    if (req.body.logoUrl !== undefined) updates.logo_url = req.body.logoUrl;
    if (req.body.bannerUrl !== undefined) updates.banner_url = req.body.bannerUrl;
    if (req.body.address !== undefined) updates.address = req.body.address;
    if (req.body.phone !== undefined) updates.phone = req.body.phone;
    updates.updated_at = new Date().toISOString();
    
    const rows = await update('workspaces', updates, { project_ref: req.projectRef });
    const workspace = Array.isArray(rows) ? rows[0] : rows;
    return res.json({ workspace: mapWorkspace(workspace) });
  } catch (err) {
    next(err);
  }
}

async function getBlockContent(req, res, next) {
  try {
    const rows = await select('block_content', { filters: { project_ref: req.projectRef } });
    return res.json({ blocks: rows || [] });
  } catch (err) {
    next(err);
  }
}

async function saveBlockContent(req, res, next) {
  try {
    const { blocks } = req.body;
    if (!Array.isArray(blocks)) {
      return next(createError('blocks must be an array', 400));
    }

    // Upsert each block
    const results = await Promise.all(
      blocks.map(async (block) => {
        const existing = await select('block_content', {
          filters: { project_ref: req.projectRef, block_id: block.blockId },
        });
        if (existing?.[0]) {
          return update('block_content', block, {
            project_ref: req.projectRef,
            block_id: block.blockId,
          });
        }
        const { v4: uuidv4 } = require('uuid');
        return insert('block_content', {
          id: uuidv4(),
          project_ref: req.projectRef,
          block_id: block.blockId,
          ...block,
          created_at: new Date().toISOString(),
        });
      })
    );

    return res.json({ ok: true, count: results.length });
  } catch (err) {
    next(err);
  }
}

module.exports = { getWorkspace, updateWorkspace, getBlockContent, saveBlockContent };
