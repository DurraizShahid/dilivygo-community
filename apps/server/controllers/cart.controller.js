'use strict';

const { v4: uuidv4 } = require('uuid');
const cartModel = require('../models/cart.model');
const shopModel = require('../models/shop.model');
const { select } = require('../lib/supabase');
const { getPlatformCurrency, resolveShopCurrency, validCurrency } = require('../lib/currency');

const SESSION_COOKIE = 'cart_session';
const COOKIE_BASE = { httpOnly: true, sameSite: 'lax', path: '/' };

function getOrCreateSessionId(req, res) {
  let sessionId = req.cookies?.[SESSION_COOKIE];
  if (!sessionId) {
    sessionId = uuidv4();
    res.cookie(SESSION_COOKIE, sessionId, { ...COOKIE_BASE, maxAge: 30 * 24 * 60 * 60 * 1000 });
  }
  return sessionId;
}

async function resolveCartSessionId(req, res) {
  const projectRef = req.projectRef;
  if (req.customer?.id && projectRef) {
    const session = await cartModel.getOrCreateCustomerSession(req.customer.id, projectRef);
    res.cookie(SESSION_COOKIE, session.id, { ...COOKIE_BASE, maxAge: 30 * 24 * 60 * 60 * 1000 });
    return session.id;
  }
  return getOrCreateSessionId(req, res);
}

async function resolveAuthoritativeCartCurrency(req, shopId) {
  if (shopId) {
    const shop = await shopModel.findById(shopId);
    if (shop) {
      const workspaceRows = shop.project_ref
        ? await select('workspaces', {
            filters: { project_ref: shop.project_ref },
            limit: 1,
          })
        : [];
      return resolveShopCurrency(shop, workspaceRows?.[0] || null);
    }
  }

  const scope = req.organizationId
    ? { organizationId: req.organizationId }
    : req.projectRef
      ? { projectRef: req.projectRef }
      : undefined;
  return getPlatformCurrency(scope);
}

async function getCart(req, res, next) {
  try {
    const sessionId = await resolveCartSessionId(req, res);
    const cart = await cartModel.getWithItems(sessionId);
    return res.json({ cart: cart || { items: [], totalCents: 0 } });
  } catch (err) {
    next(err);
  }
}

async function syncCart(req, res, next) {
  try {
    const projectRef = req.projectRef;
    if (!projectRef) {
      return res.status(400).json({ error: 'Project reference is required' });
    }
    const sessionId = await resolveCartSessionId(req, res);
    await cartModel.getOrCreate(sessionId, projectRef);
    const { items, shopId, currency } = req.body;

    const authoritativeCurrency = await resolveAuthoritativeCartCurrency(req, shopId);
    const requestedCurrency = validCurrency(currency);
    if (requestedCurrency && requestedCurrency !== authoritativeCurrency) {
      const err = new Error(
        `Currency changed to ${authoritativeCurrency.toUpperCase()}. Refresh pricing and try again.`,
      );
      err.statusCode = 409;
      err.code = 'CURRENCY_MISMATCH';
      err.details = {
        requestedCurrency: requestedCurrency.toUpperCase(),
        authoritativeCurrency: authoritativeCurrency.toUpperCase(),
      };
      throw err;
    }

    await cartModel.replaceAllItems(sessionId, items || [], {
      shopId: shopId === undefined ? undefined : shopId,
      currency: authoritativeCurrency,
      projectRef,
    });
    const cart = await cartModel.getWithItems(sessionId);
    return res.json({ cart: cart || { items: [], totalCents: 0 } });
  } catch (err) {
    next(err);
  }
}

async function addItem(req, res, next) {
  try {
    let projectRef = req.projectRef;
    if (!projectRef && req.body?.productId) {
      const rows = await select('products', { filters: { id: req.body.productId }, limit: 1 });
      projectRef = rows?.[0]?.project_ref || null;
    }
    if (!projectRef) {
      return res.status(400).json({
        error: 'Could not resolve workspace for cart (pass x-project-ref or a productId)',
      });
    }
    const sessionId = await resolveCartSessionId(req, res);
    await cartModel.getOrCreate(sessionId, projectRef);
    const item = await cartModel.addItem(sessionId, req.body);
    return res.status(201).json({ item });
  } catch (err) {
    next(err);
  }
}

async function requireCartItemForSession(req, res) {
  const { itemId } = req.params;
  const sessionId = await resolveCartSessionId(req, res);
  const item = await cartModel.findItemById(itemId);
  if (!item || item.session_id !== sessionId) {
    return { error: res.status(404).json({ error: 'Cart item not found' }) };
  }
  return { item };
}

async function updateItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const ownership = await requireCartItemForSession(req, res);
    if (ownership.error) return ownership.error;
    const item = await cartModel.updateItem(itemId, req.body);
    return res.json({ item });
  } catch (err) {
    next(err);
  }
}

async function removeItem(req, res, next) {
  try {
    const { itemId } = req.params;
    const ownership = await requireCartItemForSession(req, res);
    if (ownership.error) return ownership.error;
    await cartModel.removeItem(itemId);
    return res.json({ ok: true });
  } catch (err) {
    next(err);
  }
}

async function mergeCart(req, res, next) {
  try {
    const { guestSessionId } = req.body;
    const projectRef = req.projectRef;

    if (req.customer?.id && projectRef) {
      const targetSession = await cartModel.getOrCreateCustomerSession(req.customer.id, projectRef);
      await cartModel.mergeIntoSession(guestSessionId, targetSession.id);
      await cartModel.linkToCustomer(targetSession.id, req.customer.id);
      res.cookie(SESSION_COOKIE, targetSession.id, {
        ...COOKIE_BASE,
        maxAge: 30 * 24 * 60 * 60 * 1000,
      });
      const cart = await cartModel.getWithItems(targetSession.id);
      return res.json({ cart });
    }

    const customerSessionId = req.cookies?.[SESSION_COOKIE] || uuidv4();

    await cartModel.mergeIntoSession(guestSessionId, customerSessionId);

    if (req.customer?.id) {
      await cartModel.linkToCustomer(customerSessionId, req.customer.id);
    }

    res.cookie(SESSION_COOKIE, customerSessionId, {
      ...COOKIE_BASE,
      maxAge: 30 * 24 * 60 * 60 * 1000,
    });

    const cart = await cartModel.getWithItems(customerSessionId);
    return res.json({ cart });
  } catch (err) {
    next(err);
  }
}

module.exports = { getCart, syncCart, addItem, updateItem, removeItem, mergeCart };
