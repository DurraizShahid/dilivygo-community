'use strict';

/**
 * POS theme policy — named, tested constraint.
 * Workspace theme colors (light/dark) are stripped for pos_web surfaces to
 * preserve operational readability and status semantics. Only org theme +
 * branding + map/currency apply. This is intentional, not an accidental delete.
 */

const POS_STRIPPED_KEYS = ['light', 'dark'];

function stripWorkspaceColorsForPos(workspace) {
  if (!workspace || workspace.public_theme_overlay == null) return workspace;
  try {
    let overlay = workspace.public_theme_overlay;
    if (typeof overlay === 'string') overlay = JSON.parse(overlay);
    if (!overlay || typeof overlay !== 'object' || Array.isArray(overlay)) return workspace;
    const nextOverlay = { ...overlay };
    let stripped = false;
    for (const k of POS_STRIPPED_KEYS) {
      if (k in nextOverlay) { delete nextOverlay[k]; stripped = true; }
    }
    if (!stripped) return workspace;
    return { ...workspace, public_theme_overlay: nextOverlay };
  } catch {
    return workspace;
  }
}

module.exports = { POS_STRIPPED_KEYS, stripWorkspaceColorsForPos };
