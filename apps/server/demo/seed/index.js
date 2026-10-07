'use strict';

const bcrypt = require('bcrypt');
const logger = require('../../lib/logger');
const { select } = require('../../lib/supabase');
const bulk = require('../lib/supabase-client');
const demoConfig = require('../config');
const { PLATFORM_SUPPORT_PARTICIPANT_ID } = require('../../lib/platform-constants');

// Shared password for every seeded staff / rider account (demo-only credential).
const DEMO_PASSWORD = 'Demo1234!';

// Product definitions used by seedProducts and seedOrders
const productDefs = [
  { name: 'Classic Smash Burger', category: 'Burgers', price: 899, desc: 'Angus beef smash patty with cheddar, lettuce, tomato.' },
  { name: 'Double Smash Burger', category: 'Burgers', price: 1199, desc: 'Two smash patties, double cheddar, special sauce.' },
  { name: 'Nashville Hot Chicken Burger', category: 'Burgers', price: 1099, desc: 'Spicy Nashville hot chicken with pickles.' },
  { name: 'Mushroom Swiss Burger', category: 'Burgers', price: 999, desc: 'Sauteed mushrooms, swiss cheese, caramelized onions.' },
  { name: 'Veggie Burger', category: 'Burgers', price: 799, desc: 'House-made black bean patty with avocado.' },
  { name: 'Chicken Fajita Pizza', category: 'Pizza', price: 1299, desc: 'Grilled chicken, peppers, onions on thin crust.' },
  { name: 'Pepperoni Pizza', category: 'Pizza', price: 1099, desc: 'Classic pepperoni with mozzarella and tomato sauce.' },
  { name: 'Margherita Pizza', category: 'Pizza', price: 999, desc: 'Fresh mozzarella, basil, tomato sauce.' },
  { name: 'BBQ Chicken Pizza', category: 'Pizza', price: 1199, desc: 'BBQ sauce, grilled chicken, red onion.' },
  { name: 'Hawaiian Pizza', category: 'Pizza', price: 1049, desc: 'Ham, pineapple, mozzarella.' },
  { name: 'Loaded Fries', category: 'Appetizers', price: 449, desc: 'Crispy fries with cheese, bacon, and jalapeños.' },
  { name: 'Mozzarella Sticks', category: 'Appetizers', price: 399, desc: 'Golden fried mozzarella with marinara dip.' },
  { name: 'Chicken Wings (8pc)', category: 'Appetizers', price: 799, desc: 'Choice of sauce: buffalo, BBQ, or garlic parmesan.' },
  { name: 'Caesar Salad', category: 'Appetizers', price: 549, desc: 'Crisp romaine, parmesan, croutons, Caesar dressing.' },
  { name: 'Alfredo Pasta', category: 'Pasta', price: 1149, desc: 'Fettuccine with creamy Alfredo sauce and grilled chicken.' },
  { name: 'Spaghetti Bolognese', category: 'Pasta', price: 1049, desc: 'Traditional meat sauce with parmesan.' },
  { name: 'Chicken Parmesan', category: 'Pasta', price: 1299, desc: 'Breaded chicken, marinara, melted mozzarella.' },
  { name: 'Chocolate Lava Cake', category: 'Desserts', price: 599, desc: 'Warm chocolate cake with molten center.' },
  { name: 'Lotus Cheesecake', category: 'Desserts', price: 549, desc: 'New York style cheesecake with berry compote.' },
  { name: 'Tiramisu', category: 'Desserts', price: 599, desc: 'Classic Italian mascarpone dessert.' },
  { name: 'Cheesecake Special', category: 'Desserts', price: 649, desc: 'Strawberry cheesecake with whipped cream.' },
  { name: 'Cola', category: 'Drinks', price: 199, desc: '330ml can.' },
  { name: 'Sprite', category: 'Drinks', price: 199, desc: '330ml can.' },
  { name: 'Mint Margarita', category: 'Drinks', price: 649, desc: 'Refreshing mint and lime cocktail.' },
  { name: 'Fresh Lemonade', category: 'Drinks', price: 299, desc: 'Homemade lemonade with mint.' },
  { name: 'Iced Tea', category: 'Drinks', price: 249, desc: 'Sweet or unsweet iced tea.' },
  { name: 'Water', category: 'Drinks', price: 99, desc: 'Still or sparkling.' },
  { name: 'Family Burger Deal', category: 'Deals', price: 2499, desc: '4 burgers, 2 large fries, 4 drinks.' },
  { name: 'Pizza Party Box', category: 'Deals', price: 2999, desc: '2 large pizzas, garlic bread, 4 drinks.' },
  { name: 'Wings + Fries + Drink', category: 'Deals', price: 1599, desc: '12 wings, loaded fries, drink.' },
  { name: 'Family Feast', category: 'Family Meals', price: 4499, desc: '2 large pizzas, 2 burgers, 4 sides, 4 drinks.' },
  { name: 'Burger Feast', category: 'Family Meals', price: 3499, desc: '6 burgers, 3 large fries, 6 drinks.' },
  { name: 'Chicken Wrap', category: 'Wraps', price: 799, desc: 'Grilled chicken wrap with vegetables.' },
  { name: 'Beef Wrap', category: 'Wraps', price: 849, desc: 'Seasoned beef wrap with cheese and lettuce.' },
  { name: 'Veggie Wrap', category: 'Wraps', price: 699, desc: 'Hummus, vegetables, feta in a tortilla.' },
];

/**
 * Execute the main demo seed routine.
 * Creates the canonical demo tenant with all its data.
 */
async function seedDatabase() {
  console.log('🌱 Starting demo seed...');
  console.log(`   Seed: ${demoConfig.getSeed()}`);
  console.log(`   Size: ${demoConfig.DEMO_SIZE}`);
  console.log(`   Environment: ${demoConfig.isDemoEnvironment() ? 'DEMO' : 'development'}`);

  const shops = await getDemoShops();
  if (!shops.length) {
    console.log('  ⚠️  No shops found for the demo organization. Run migrations first.');
    return;
  }

  const seed = demoConfig.getSeed();

  await seedCoreData(shops, seed);
  await seedBusinessData(shops, seed);
  await seedExtendedData(shops, seed);

  console.log('✅ Demo seeding complete!');
}

async function getDemoShops() {
  const orgs = await select('organizations', {
    filters: { public_ref: 'dilivygo-demo' },
    limit: 1,
  });
  const org = orgs && orgs[0] ? orgs[0] : null;
  if (org) {
    const scoped = await select('shops', {
      filters: { organization_id: org.id },
      order: 'id.asc',
      limit: 50,
    });
    if (scoped && scoped.length) return scoped;
  }
  return (await select('shops', { order: 'id.asc', limit: 50 })) || [];
}

async function seedCoreData(shops, seed) {
  console.log('📦 Seeding core data (categories, menu)...');

  const categories = [
    { name: 'Burgers', sort_order: 1 },
    { name: 'Pizza', sort_order: 2 },
    { name: 'Fried Chicken', sort_order: 3 },
    { name: 'Wraps', sort_order: 4 },
    { name: 'Pasta', sort_order: 5 },
    { name: 'Appetizers', sort_order: 6 },
    { name: 'Desserts', sort_order: 7 },
    { name: 'Drinks', sort_order: 8 },
    { name: 'Deals', sort_order: 9 },
    { name: 'Family Meals', sort_order: 10 },
  ];

  const rows = [];
  for (let s = 0; s < shops.length; s++) {
    const shop = shops[s];
    for (let c = 0; c < categories.length; c++) {
      const cat = categories[c];
      rows.push({
        id: generateId(seed + 100000 + s * 100 + c),
        project_ref: shop.project_ref,
        organization_id: shop.organization_id,
        shop_id: shop.id,
        name: cat.name,
        sort_order: cat.sort_order,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
    }
  }
  await bulk.bulkUpsert('categories', rows, 'id');

  console.log(`  ✅ ${rows.length} categories across ${shops.length} shops`);
}

async function seedBusinessData(shops, seed) {
  console.log('📦 Seeding business data (customers, orders, staff)...');

  await seedCustomers(shops, seed);
  await seedStaff(shops, seed);
  await seedProducts(shops, seed);
  await seedOrders(shops, seed);
  await seedDeliveries(shops, seed);

  console.log('  ✅ Business data seeded');
}

async function seedExtendedData(shops, seed) {
  console.log('📦 Seeding extended data (reviews, support, refunds, promotions, banners)...');

  await seedReviews(shops, seed);
  await seedSupportTickets(shops, seed);
  await seedRefunds(shops, seed);
  await seedPromotions(shops, seed);
  await seedWalletTransactions(shops, seed);
  await seedDashboardData(shops, seed);

  console.log('  ✅ Extended data seeded');
}

async function seedDashboardData(shops, seed) {
  console.log('📦 Seeding dashboard data (support, promotions, team)...');

  await seedSupportRatings(shops, seed);
  await seedPromoRedemptions(shops, seed);
  await seedTips(shops, seed);
  await seedCustomerFavorites(shops, seed);
  await seedPushTokens(shops, seed);
  await seedProductVariants(shops, seed);
  await seedModifiers(shops, seed);
  await seedOrderItemModifiers(shops, seed);
  await seedTeamMembers(shops, seed);
  await seedAuditLogEntries(shops, seed);
  await seedOrganizationHostnames(shops, seed);

  console.log('  ✅ Dashboard data seeded');
}

// ─── Helper Functions ──────────────────────────────────────────────

function generateId(n) {
  const hex = Math.floor(Math.abs(Number(n) || 0)).toString(16).padStart(15, '0').slice(-15);
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-4${hex.slice(12, 15)}-8000-000000000000`;
}

let cachedDemoPasswordHash = null;
async function demoPasswordHash() {
  if (!cachedDemoPasswordHash) {
    cachedDemoPasswordHash = await bcrypt.hash(DEMO_PASSWORD, 12);
  }
  return cachedDemoPasswordHash;
}

function splitName(name) {
  const parts = String(name).trim().split(/\s+/);
  const first = parts.shift() || 'Demo';
  const last = parts.join(' ') || 'Staff';
  return { first, last };
}

function batch(array, size) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

async function upsertBatched(table, rows, onConflict, label) {
  let ok = 0;
  for (const chunk of batch(rows, 100)) {
    try {
      await bulk.bulkUpsert(table, chunk, onConflict);
      ok += chunk.length;
    } catch (err) {
      logger.debug(`${label} batch failed: ${err.message}`);
    }
  }
  return ok;
}

async function seedCustomers(shops, seed) {
  const count = demoConfig.isFullSize() ? 400 : 100;
  const { seededRandom, randomName, randomAddress } = require('../lib/random');

  const customers = [];
  for (let i = 0; i < count; i++) {
    const shop = shops[i % shops.length];
    const rng = seededRandom(seed + i * 17);
    customers.push({
      id: generateId(seed + 1000 + i),
      phone: `+4477009${String(i).padStart(5, '0')}`,
      name: randomName(rng, i),
      email: `demo.customer.${i}@example.com`,
      project_ref: shop.project_ref,
      organization_id: shop.organization_id,
      wallet_balance_cents: rng.nextInt(0, 5000),
      avatar_url: `https://i.pravatar.cc/150?u=${seed + i}`,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const addresses = customers.map((customer, i) => {
    const rng = seededRandom(seed + i * 17 + 3);
    return {
      id: generateId(seed + 41000 + i),
      customer_id: customer.id,
      label: 'Home',
      address_line1: randomAddress(rng),
      city: ['London', 'Manchester', 'Birmingham', 'Leeds'][rng.nextInt(0, 3)],
      postcode: `${['EC1A', 'M1', 'B1', 'L1'][rng.nextInt(0, 3)]} ${String(rng.nextInt(1, 99)).padStart(2, '0')}AA`,
      is_default: true,
      organization_id: customer.organization_id,
      created_at: new Date().toISOString(),
    };
  });

  const customersOk = await upsertBatched('customers', customers, 'id', 'Customer');
  const addressesOk = await upsertBatched('customer_addresses', addresses, 'id', 'Customer address');

  console.log(`  ✅ ${customersOk} customers, ${addressesOk} addresses`);
}

async function seedStaff(shops, seed) {
  const orgId = shops[0].organization_id;
  const primaryRef = shops[0].project_ref;
  const passwordHash = await demoPasswordHash();

  const staffDefs = [
    { email: 'owner@demo.com', name: 'Demo Owner', role: 'admin', projectRef: primaryRef },
    { email: 'ops@demo.com', name: 'Ops Manager', role: 'admin', projectRef: primaryRef },
    { email: 'manager-f7@demo.com', name: 'F-7 Manager', role: 'vendor', projectRef: 'crust-flame-f7' },
    { email: 'manager-dha@demo.com', name: 'DHA Manager', role: 'vendor', projectRef: 'crust-flame-dha' },
    { email: 'manager-bahria@demo.com', name: 'Bahria Manager', role: 'vendor', projectRef: 'crust-flame-bahria' },
    { email: 'manager-gulberg@demo.com', name: 'Gulberg Manager', role: 'vendor', projectRef: 'crust-flame-gulberg' },
    { email: 'cashier@demo.com', name: 'POS Cashier', role: 'vendor', projectRef: 'crust-flame-f7' },
    { email: 'kitchen@demo.com', name: 'Kitchen Staff', role: 'vendor', projectRef: 'crust-flame-f7' },
  ];

  const users = [];
  const userShops = [];
  let linkCounter = 0;

  for (let i = 0; i < staffDefs.length; i++) {
    const def = staffDefs[i];
    const { first, last } = splitName(def.name);
    const userId = generateId(seed + 5000 + i);
    users.push({
      id: userId,
      email: def.email,
      password_hash: passwordHash,
      role: def.role,
      project_ref: def.projectRef,
      organization_id: orgId,
      display_name: def.name,
      first_name: first,
      last_name: last,
      totp_enabled: false,
      payout_method: 'manual',
      created_at: new Date().toISOString(),
    });

    if (def.role === 'vendor') {
      for (const shop of shops.filter((s) => s.project_ref === def.projectRef)) {
        userShops.push({
          id: generateId(seed + 5500 + linkCounter++),
          user_id: userId,
          shop_id: shop.id,
          organization_id: orgId,
          created_at: new Date().toISOString(),
        });
      }
    }
  }

  await bulk.bulkUpsert('app_users', users, 'id');
  if (userShops.length) await bulk.bulkUpsert('user_shops', userShops, 'id');

  console.log(`  ✅ ${users.length} staff accounts (${userShops.length} shop links)`);
}


async function seedProducts(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const products = [];
  let counter = 0;

  for (const shop of shops) {
    for (const def of productDefs) {
      const rng = seededRandom(seed + 8000 + counter);
      const catCode = def.category.replace(/[^a-z]/gi, '').substring(0, 3).toUpperCase();
      products.push({
        id: generateId(seed + 8000 + counter),
        project_ref: shop.project_ref,
        shop_id: shop.id,
        organization_id: shop.organization_id,
        name: def.name,
        description: def.desc,
        price_cents: def.price,
        category: def.category,
        image_url: `/images/products/${def.category.toLowerCase().replace(/\s+/g, '-')}.jpg`,
        available: rng.next() > 0.05,
        sort_order: counter,
        dietary_tags: [],
        barcode: null,
        sku: `${catCode}-${String(counter + 1).padStart(3, '0')}`,
        commission_bps: null,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      counter++;
    }
  }

  const ok = await upsertBatched('products', products, 'id', 'Product');
  console.log(`  ✅ ${ok} products across ${shops.length} shops`);
}

async function seedOrders(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const customers = await select('customers', { order: 'id.asc', limit: 200 });
  if (!customers.length) {
    console.log('  ⚠️  No customers found; skipping orders');
    return;
  }

  const productsByShop = {};
  for (const shop of shops) {
    productsByShop[shop.id] = (await select('products', { filters: { shop_id: shop.id }, order: 'id.asc', limit: 100 })) || [];
  }

  const count = demoConfig.isFullSize() ? 2000 : 200;
  const statuses = ['placed', 'accepted', 'preparing', 'ready', 'assigned', 'picked_up', 'arrived', 'completed', 'cancelled', 'rejected'];
  const orders = [];
  const items = [];
  let itemCounter = 0;

  const pushItems = (orderId, shopId, organizationId, rng, maxItems) => {
    const catalog = productsByShop[shopId] || [];
    if (!catalog.length) return;
    const itemCount = Math.min(rng.nextInt(1, maxItems), catalog.length);
    for (let j = 0; j < itemCount; j++) {
      const product = catalog[rng.nextInt(0, catalog.length - 1)];
      items.push({
        id: generateId(seed + 300000 + itemCounter++),
        order_id: orderId,
        product_id: product.id,
        name: product.name,
        quantity: rng.nextInt(1, 3),
        unit_price_cents: product.price_cents,
        notes: null,
        product_variant_id: null,
        organization_id: organizationId,
      });
    }
  };

  for (let i = 0; i < count; i++) {
    const shop = shops[i % shops.length];
    const customer = customers[i % customers.length];
    const rng = seededRandom(seed + 9000 + i);
    const status = statuses[rng.nextInt(0, statuses.length - 1)];
    const totalCents = rng.nextInt(800, 8000);
    const createdDate = new Date(Date.now() - rng.nextInt(0, 180) * 86400000);
    createdDate.setHours(rng.nextInt(8, 23), rng.nextInt(0, 59));
    const isPaid = ['completed', 'arrived', 'picked_up', 'assigned'].includes(status);
    const orderId = generateId(seed + 10000 + i);
    const commission = Math.round(totalCents * 0.15);

    pushItems(orderId, shop.id, shop.organization_id, rng, 5);

    orders.push({
      id: orderId,
      project_ref: shop.project_ref,
      shop_id: shop.id,
      customer_id: customer.id,
      organization_id: shop.organization_id,
      status,
      payment_status: isPaid ? 'paid' : 'unpaid',
      total_cents: totalCents,
      delivery_fee_cents: rng.nextInt(0, 300),
      discount_cents: rng.nextInt(0, 500),
      currency: 'gbp',
      delivery_mode: 'third_party',
      delivery_address: `${rng.nextInt(1, 200)} Demo Street, London, EC1A ${String(rng.nextInt(1, 99)).padStart(2, '0')}AA`,
      delivery_notes: null,
      prep_time_minutes: rng.nextInt(10, 30),
      cutlery_requested: rng.next() < 0.3,
      cutlery_fee_cents: 0,
      platform_commission_cents: commission,
      vendor_payout_cents: totalCents - commission,
      scheduled_for: null,
      created_at: createdDate.toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const liveOrders = [
    { status: 'placed', shopIdx: 0 },
    { status: 'placed', shopIdx: 1 },
    { status: 'placed', shopIdx: 2 },
    { status: 'preparing', shopIdx: 0 },
    { status: 'preparing', shopIdx: 1 },
    { status: 'preparing', shopIdx: 3 },
    { status: 'ready', shopIdx: 2 },
    { status: 'ready', shopIdx: 0 },
    { status: 'assigned', shopIdx: 1 },
    { status: 'assigned', shopIdx: 3 },
    { status: 'picked_up', shopIdx: 0 },
    { status: 'picked_up', shopIdx: 2 },
    { status: 'arrived', shopIdx: 1 },
    { status: 'completed', shopIdx: 0 },
    { status: 'assigned', shopIdx: 3 },
    { status: 'scheduled', shopIdx: 1 },
  ];

  for (let k = 0; k < liveOrders.length; k++) {
    const lo = liveOrders[k];
    const shop = shops[lo.shopIdx % shops.length];
    const customer = customers[k % customers.length];
    const rng = seededRandom(seed + 20000 + k);
    const totalCents = rng.nextInt(800, 5800);
    const orderId = generateId(seed + 20000 + k);
    const commission = Math.round(totalCents * 0.15);

    pushItems(orderId, shop.id, shop.organization_id, rng, 4);

    orders.push({
      id: orderId,
      project_ref: shop.project_ref,
      shop_id: shop.id,
      customer_id: customer.id,
      organization_id: shop.organization_id,
      status: lo.status,
      payment_status: 'paid',
      total_cents: totalCents,
      delivery_fee_cents: lo.status === 'scheduled' ? 0 : rng.nextInt(0, 300),
      discount_cents: rng.nextInt(0, 200),
      currency: 'gbp',
      delivery_mode: 'third_party',
      delivery_address: `${rng.nextInt(1, 200)} Demo Street, London, EC1A ${String(rng.nextInt(1, 99)).padStart(2, '0')}AA`,
      delivery_notes: null,
      prep_time_minutes: rng.nextInt(10, 30),
      cutlery_requested: false,
      cutlery_fee_cents: 0,
      platform_commission_cents: commission,
      vendor_payout_cents: totalCents - commission,
      scheduled_for: lo.status === 'scheduled' ? new Date(Date.now() + 3600000).toISOString() : null,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const ordersOk = await upsertBatched('orders', orders, 'id', 'Order');
  const itemsOk = await upsertBatched('order_items', items, 'id', 'Order item');

  console.log(`  ✅ ${ordersOk} orders (including ${liveOrders.length} live), ${itemsOk} order items`);
}

async function seedDeliveries(shops, seed) {
  const riders = await getDemoRiders(shops);
  const activeOrders = (await select('orders', { filters: { status: 'assigned' }, order: 'id.asc', limit: 50 })) || [];

  if (!riders.length || !activeOrders.length) {
    console.log('  ⚠️  No riders or assigned orders found; skipping deliveries');
    return;
  }

  const { seededRandom } = require('../lib/random');
  const deliveries = [];

  for (let i = 0; i < activeOrders.length; i++) {
    const order = activeOrders[i];
    const rider = riders[i % riders.length];
    const rng = seededRandom(seed + 40000 + i);
    deliveries.push({
      id: generateId(seed + 40000 + i),
      order_id: order.id,
      rider_id: rider.id,
      status: 'assigned',
      zone_id: null,
      eta_minutes: rng.nextInt(10, 40),
      claimed_at: new Date().toISOString(),
      is_external: false,
      rider_delivery_fee_cents: rng.nextInt(200, 600),
      organization_id: order.organization_id,
      created_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const ok = await upsertBatched('deliveries', deliveries, 'id', 'Delivery');
  console.log(`  ✅ ${ok} deliveries`);
}

async function seedReviews(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const orders = (await select('orders', { order: 'id.asc', limit: 120 })) || [];
  if (!orders.length) {
    console.log('  ⚠️  No orders found; skipping reviews');
    return;
  }

  const comments = [
    'Amazing food! The smash burger was incredible.',
    'Fast delivery, food was hot and fresh.',
    'Great service, friendly staff.',
    'The pizza was delicious, will definitely order again.',
    'Good portion sizes, fair prices.',
    'Delivery was a bit late but food quality was excellent.',
    'Best restaurant in the area!',
    'Loved the family meal deal, great value.',
    'The chicken wings were perfectly crispy.',
    'Quick order and great customer service.',
    'Could use more vegetarian options.',
    'Packaging was excellent, nothing spilled.',
    'The garlic bread was a standout.',
    'Consistently great food and fast delivery.',
    'Highly recommend the pasta dishes.',
    'Order was correct and arrived on time.',
    'Some items were cold but overall good experience.',
    'Perfect for a family dinner night.',
    'The dessert menu is fantastic.',
    'Would order again in a heartbeat.',
  ];

  const reviews = [];
  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    if (!order.shop_id || !order.customer_id) continue;
    const rng = seededRandom(seed + 50000 + i);
    const rating = [5, 5, 5, 4, 4, 4, 3, 3, 2, 1][rng.nextInt(0, 9)];
    reviews.push({
      id: generateId(seed + 60000 + i),
      project_ref: order.project_ref,
      shop_id: order.shop_id,
      order_id: order.id,
      customer_id: order.customer_id,
      organization_id: order.organization_id,
      rating,
      comment: comments[rng.nextInt(0, comments.length - 1)],
      moderation_status: 'visible',
      created_at: order.created_at || new Date().toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const ok = await upsertBatched('shop_reviews', reviews, 'id', 'Review');
  console.log(`  ✅ ${ok} reviews`);
}

async function seedSupportTickets(shops, seed) {
  const customers = (await select('customers', { order: 'id.asc', limit: 50 })) || [];
  const orders = (await select('orders', { order: 'id.asc', limit: 30 })) || [];
  if (!customers.length) {
    console.log('  ⚠️  No customers found; skipping support conversations');
    return;
  }

  const shop = shops[0];
  const subjects = ['Late delivery', 'Missing item', 'Incorrect order', 'Refund request', 'Payment issue', 'Compliment', 'General question'];
  const conversations = [];
  const messages = [];
  let msgCounter = 0;

  for (let i = 0; i < 30; i++) {
    const customer = customers[i % customers.length];
    const order = orders.length ? orders[i % orders.length] : null;
    const convId = generateId(seed + 70000 + i);
    const closed = i % 3 !== 0;
    const createdAt = new Date(Date.now() - i * 3600000).toISOString();

    conversations.push({
      id: convId,
      project_ref: shop.project_ref,
      organization_id: shop.organization_id,
      order_id: order ? order.id : null,
      type: 'customer_support',
      participant_1_id: customer.id,
      participant_2_id: PLATFORM_SUPPORT_PARTICIPANT_ID,
      support_subject: subjects[i % subjects.length],
      support_closed_at: closed ? new Date().toISOString() : null,
      created_at: createdAt,
      updated_at: createdAt,
    });

    const msgCount = 1 + ((i + 1) % 3);
    for (let m = 0; m < msgCount; m++) {
      const fromCustomer = m % 2 === 0;
      messages.push({
        id: generateId(seed + 350000 + msgCounter++),
        conversation_id: convId,
        sender_id: fromCustomer ? customer.id : PLATFORM_SUPPORT_PARTICIPANT_ID,
        sender_role: fromCustomer ? 'customer' : 'admin',
        content: fromCustomer
          ? `Hi, I have a question about ${subjects[i % subjects.length].toLowerCase()}.`
          : 'Thanks for reaching out — our support team is looking into it.',
        read_at: null,
        organization_id: shop.organization_id,
        created_at: new Date(Date.now() - i * 3600000 + m * 60000).toISOString(),
      });
    }
  }

  const convOk = await upsertBatched('conversations', conversations, 'id', 'Support conversation');
  const msgOk = await upsertBatched('messages', messages, 'id', 'Support message');
  console.log(`  ✅ ${convOk} support conversations, ${msgOk} messages`);
}

async function seedRefunds(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const orders = (await select('orders', { filters: { status: 'completed' }, order: 'id.asc', limit: 30 })) || [];
  if (!orders.length) {
    console.log('  ⚠️  No completed orders found; skipping refund requests');
    return;
  }

  const statuses = ['pending', 'approved', 'rejected', 'cancelled'];
  const reasons = ['Cold food', 'Wrong item', 'Late delivery', 'Missing item', 'Quality issue'];
  const refunds = [];

  for (let i = 0; i < orders.length; i++) {
    const order = orders[i];
    const rng = seededRandom(seed + 80000 + i);
    refunds.push({
      id: generateId(seed + 80000 + i),
      project_ref: order.project_ref,
      organization_id: order.organization_id,
      order_id: order.id,
      customer_id: order.customer_id,
      status: statuses[i % statuses.length],
      reason: reasons[i % reasons.length],
      requested_amount_cents: rng.nextInt(500, 3500),
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
      updated_at: new Date().toISOString(),
    });
  }

  const ok = await upsertBatched('refund_requests', refunds, 'id', 'Refund request');
  console.log(`  ✅ ${ok} refund requests`);
}

async function seedPromotions(shops, seed) {
  const shop = shops[0];
  const day = 86400000;
  const now = Date.now();

  const defs = [
    { code: 'WELCOME20', type: 'percentage', value: 20, active: true, startsAt: now - 30 * day, endsAt: now + 60 * day },
    { code: 'FREESHIP', type: 'free_delivery', value: 0, active: true, startsAt: now, endsAt: now + 3 * day },
    { code: 'FAMILY15', type: 'fixed_amount', value: 500, active: true, startsAt: now - 7 * day, endsAt: now + 7 * day },
    { code: 'NIGHT25', type: 'percentage', value: 25, active: false, startsAt: now + 2 * day, endsAt: now + 5 * day },
    { code: 'BACK10', type: 'percentage', value: 10, active: false, startsAt: now - 90 * day, endsAt: now - 30 * day },
  ];

  const promos = defs.map((def, i) => ({
    id: generateId(seed + 90000 + i),
    project_ref: shop.project_ref,
    organization_id: shop.organization_id,
    shop_id: shop.id,
    code: def.code,
    type: def.type,
    value: def.value,
    min_order_cents: 2000,
    max_discount_cents: 2000,
    max_uses: 500,
    max_uses_per_customer: 1,
    times_used: (i * 37) % 300,
    starts_at: new Date(def.startsAt).toISOString(),
    ends_at: new Date(def.endsAt).toISOString(),
    is_active: def.active,
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  }));

  const ok = await upsertBatched('promo_codes', promos, 'id', 'Promotion');
  console.log(`  ✅ ${ok} promotions`);
}




async function seedWalletTransactions(shops, seed) {
  const customers = (await select('customers', { order: 'id.asc', limit: 30 })) || [];
  if (!customers.length) {
    console.log('  ⚠️  No customers found; skipping wallet transactions');
    return;
  }

  const types = ['admin_credit', 'checkout_debit', 'refund_credit'];
  const walletTxns = [];

  for (let i = 0; i < 30; i++) {
    const customer = customers[i % customers.length];
    walletTxns.push({
      id: generateId(seed + 140000 + i),
      customer_id: customer.id,
      project_ref: customer.project_ref,
      organization_id: customer.organization_id,
      amount_cents: 100 + ((i * 137) % 2000),
      type: types[i % types.length],
      reference_type: 'demo_seed',
      reference_id: null,
      idempotency_key: `demo-wallet-${seed}-${i}`,
      metadata: {},
      created_at: new Date(Date.now() - i * 86400000).toISOString(),
    });
  }

  const ok = await upsertBatched('customer_wallet_ledger', walletTxns, 'id', 'Wallet transaction');
  console.log(`  ✅ ${ok} wallet transactions`);
}

// ─── Dashboard / operations data ───────────────────────────────────

async function getDemoRiders(shops, limit = 50) {
  return (await select('app_users', {
    filters: { role: 'rider', organization_id: shops[0].organization_id },
    order: 'id.asc',
    limit,
  })) || [];
}

async function getActiveDeliveries() {
  return (await select('deliveries', {
    select: 'id,order_id,rider_id,status,organization_id',
    filters: { status: ['assigned', 'picked_up', 'arrived'] },
    order: 'id.asc',
    limit: 200,
  })) || [];
}

function shopCoords(shop, fallbackIndex) {
  const lat = shop && shop.lat != null ? Number(shop.lat) : 31.5204 + (fallbackIndex % 5) * 0.03;
  const lon = shop && shop.lon != null ? Number(shop.lon) : 74.3587 + (fallbackIndex % 5) * 0.03;
  return { lat, lon };
}




async function seedSupportRatings(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const conversations = (await select('conversations', {
    filters: { type: 'customer_support' },
    order: 'id.asc',
    limit: 100,
  })) || [];
  const rated = conversations.filter((c) => c.support_closed_at).slice(0, 20);
  if (!rated.length) {
    console.log('  ⚠️  No closed support conversations found; skipping support ratings');
    return;
  }

  const comments = [
    'Quick and helpful response.',
    'Support resolved my issue right away.',
    'Very polite and professional.',
    'Took a while but got there in the end.',
    'Great follow-up after my complaint.',
    'Issue was fully resolved, thank you.',
  ];

  const rows = rated.map((conv, i) => {
    const rng = seededRandom(seed + 190000 + i);
    return {
      id: generateId(seed + 190000 + i),
      conversation_id: conv.id,
      project_ref: conv.project_ref,
      customer_id: conv.participant_1_id,
      ticket_subject: conv.support_subject || 'Support request',
      stars: [5, 5, 5, 4, 4, 3][rng.nextInt(0, 5)],
      comment: comments[rng.nextInt(0, comments.length - 1)],
      organization_id: conv.organization_id,
      created_at: new Date(Date.now() - i * 3600000).toISOString(),
      updated_at: new Date().toISOString(),
    };
  });

  const ok = await upsertBatched('support_ticket_ratings', rows, 'conversation_id', 'Support rating');
  console.log(`  ✅ ${ok} support ticket ratings`);
}

async function seedPromoRedemptions(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const promos = (await select('promo_codes', { order: 'id.asc', limit: 50 })) || [];
  const orders = (await select('orders', {
    filters: { status: ['completed', 'arrived', 'picked_up'] },
    order: 'id.asc',
    limit: 300,
  })) || [];
  if (!promos.length || !orders.length) {
    console.log('  ⚠️  No promos or eligible orders found; skipping promo redemptions');
    return;
  }

  const rows = [];
  let counter = 0;
  const perPromo = Math.max(2, Math.min(15, Math.floor(orders.length / promos.length)));
  for (let p = 0; p < promos.length; p++) {
    const promo = promos[p];
    for (let j = 0; j < perPromo; j++) {
      const order = orders[(p * perPromo + j) % orders.length];
      if (!order.customer_id) continue;
      const rng = seededRandom(seed + 200000 + counter);
      rows.push({
        id: generateId(seed + 200000 + counter),
        promo_code_id: promo.id,
        order_id: order.id,
        customer_id: order.customer_id,
        discount_cents: order.discount_cents || rng.nextInt(100, 800),
        organization_id: order.organization_id,
        created_at: order.created_at || new Date().toISOString(),
      });
      counter++;
    }
  }

  const ok = await upsertBatched('promo_redemptions', rows, 'id', 'Promo redemption');
  console.log(`  ✅ ${ok} promo redemptions`);
}

async function seedTips(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const riders = await getDemoRiders(shops);
  const orders = (await select('orders', {
    filters: { status: ['completed', 'arrived'] },
    order: 'id.asc',
    limit: 60,
  })) || [];
  if (!riders.length || !orders.length) {
    console.log('  ⚠️  No riders or completed orders found; skipping tips');
    return;
  }

  const rows = orders.map((order, i) => {
    const rng = seededRandom(seed + 210000 + i);
    const rider = riders[i % riders.length];
    const amount = rng.nextInt(100, 1000);
    const commissionBps = 1500;
    const platformFee = Math.round((amount * commissionBps) / 10000);
    return {
      id: generateId(seed + 210000 + i),
      order_id: order.id,
      from_customer_id: order.customer_id,
      to_rider_id: rider.id,
      amount_cents: amount,
      commission_bps: commissionBps,
      platform_fee_cents: platformFee,
      rider_net_cents: amount - platformFee,
      organization_id: order.organization_id,
      created_at: order.created_at || new Date().toISOString(),
    };
  });

  const ok = await upsertBatched('tips', rows, 'id', 'Tip');
  console.log(`  ✅ ${ok} tips`);
}


async function seedCustomerFavorites(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const customers = (await select('customers', { order: 'id.asc', limit: 150 })) || [];
  const products = (await select('products', { order: 'id.asc', limit: 200 })) || [];
  if (!customers.length || !products.length) {
    console.log('  ⚠️  No customers or products found; skipping favorites');
    return;
  }

  const rows = [];
  let counter = 0;
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const shop = shops[i % shops.length];
    const product = products[(i * 3) % products.length];
    const rng = seededRandom(seed + 230000 + counter);
    rows.push({
      id: generateId(seed + 230000 + counter),
      customer_id: customer.id,
      project_ref: customer.project_ref,
      kind: 'shop',
      shop_id: shop.id,
      product_id: null,
      organization_id: customer.organization_id,
      created_at: new Date(Date.now() - rng.nextInt(0, 60) * 86400000).toISOString(),
    });
    counter++;
    rows.push({
      id: generateId(seed + 230000 + counter),
      customer_id: customer.id,
      project_ref: customer.project_ref,
      kind: 'product',
      shop_id: product.shop_id,
      product_id: product.id,
      organization_id: customer.organization_id,
      created_at: new Date(Date.now() - rng.nextInt(0, 60) * 86400000).toISOString(),
    });
    counter++;
  }

  const ok = await upsertBatched('customer_favorites', rows, 'id', 'Customer favorite');
  console.log(`  ✅ ${ok} customer favorites`);
}

async function seedPushTokens(shops, seed) {
  const { seededRandom } = require('../lib/random');
  const customers = (await select('customers', { order: 'id.asc', limit: 200 })) || [];
  const riders = await getDemoRiders(shops);
  if (!customers.length && !riders.length) {
    console.log('  ⚠️  No customers or riders found; skipping push tokens');
    return;
  }

  const platforms = ['ios', 'android', 'web'];
  const rows = [];
  let counter = 0;
  for (let i = 0; i < customers.length; i++) {
    const customer = customers[i];
    const rng = seededRandom(seed + 240000 + counter);
    rows.push({
      id: generateId(seed + 240000 + counter),
      user_id: customer.id,
      user_role: 'customer',
      token: `demo-customer-${seed}-${i}`,
      platform: platforms[i % platforms.length],
      project_ref: customer.project_ref,
      organization_id: customer.organization_id,
      created_at: new Date(Date.now() - rng.nextInt(0, 90) * 86400000).toISOString(),
    });
    counter++;
  }
  for (let i = 0; i < riders.length; i++) {
    const rider = riders[i];
    rows.push({
      id: generateId(seed + 240000 + counter),
      user_id: rider.id,
      user_role: 'rider',
      token: `demo-rider-${seed}-${i}`,
      platform: platforms[i % platforms.length],
      project_ref: rider.project_ref,
      organization_id: rider.organization_id,
      created_at: new Date().toISOString(),
    });
    counter++;
  }

  const ok = await upsertBatched('push_tokens', rows, 'user_id,platform', 'Push token');
  console.log(`  ✅ ${ok} push tokens`);
}


async function seedProductVariants(shops, seed) {
  const products = (await select('products', { order: 'id.asc', limit: 300 })) || [];
  if (!products.length) {
    console.log('  ⚠️  No products found; skipping product variants');
    return;
  }

  const rows = [];
  let counter = 0;
  for (let i = 0; i < products.length; i++) {
    const product = products[i];
    const variants = [
      { name: 'Regular', priceDelta: 0 },
      { name: 'Large', priceDelta: 250 },
    ];
    for (let v = 0; v < variants.length; v++) {
      const def = variants[v];
      rows.push({
        id: generateId(seed + 260000 + counter),
        product_id: product.id,
        name: def.name,
        price_cents: product.price_cents + def.priceDelta,
        sku: `VAR-${String(counter + 1).padStart(4, '0')}`,
        barcode: null,
        image_url: null,
        stock_quantity: 20 + ((counter * 7) % 80),
        available: product.available !== false,
        sort_order: v,
        organization_id: product.organization_id,
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      });
      counter++;
    }
  }

  const ok = await upsertBatched('product_variants', rows, 'id', 'Product variant');
  console.log(`  ✅ ${ok} product variants`);
}

async function seedModifiers(shops, seed) {
  const products = (await select('products', { order: 'id.asc', limit: 300 })) || [];
  if (!products.length) {
    console.log('  ⚠️  No products found; skipping modifiers');
    return;
  }

  const groupDefs = [
    {
      name: 'Size',
      required: true,
      minSelections: 1,
      maxSelections: 1,
      options: [
        { name: 'Small', price: 0, isDefault: true },
        { name: 'Medium', price: 150, isDefault: false },
        { name: 'Large', price: 300, isDefault: false },
      ],
    },
    {
      name: 'Extras',
      required: false,
      minSelections: 0,
      maxSelections: 3,
      options: [
        { name: 'Extra Cheese', price: 100, isDefault: false },
        { name: 'Bacon', price: 200, isDefault: false },
        { name: 'Avocado', price: 150, isDefault: false },
      ],
    },
  ];

  const groups = [];
  const options = [];
  let groupCounter = 0;
  let optionCounter = 0;
  const now = new Date().toISOString();

  for (let i = 0; i < products.length; i += 4) {
    const product = products[i];
    for (let g = 0; g < groupDefs.length; g++) {
      const def = groupDefs[g];
      const groupId = generateId(seed + 270000 + groupCounter);
      groups.push({
        id: groupId,
        product_id: product.id,
        name: def.name,
        required: def.required,
        min_selections: def.minSelections,
        max_selections: def.maxSelections,
        sort_order: g,
        organization_id: product.organization_id,
        created_at: now,
        updated_at: now,
      });
      groupCounter++;
      for (let o = 0; o < def.options.length; o++) {
        const opt = def.options[o];
        options.push({
          id: generateId(seed + 280000 + optionCounter),
          group_id: groupId,
          name: opt.name,
          price_cents: opt.price,
          is_default: opt.isDefault,
          sort_order: o,
          created_at: now,
        });
        optionCounter++;
      }
    }
  }

  const groupsOk = await upsertBatched('modifier_groups', groups, 'id', 'Modifier group');
  const optionsOk = await upsertBatched('modifier_options', options, 'id', 'Modifier option');
  console.log(`  ✅ ${groupsOk} modifier groups, ${optionsOk} modifier options`);
}

async function seedOrderItemModifiers(shops, seed) {
  const items = (await select('order_items', { order: 'id.asc', limit: 600 })) || [];
  if (!items.length) {
    console.log('  ⚠️  No order items found; skipping order item modifiers');
    return;
  }

  const productIds = [...new Set(items.map((it) => it.product_id).filter(Boolean))];
  const groups = productIds.length
    ? (await select('modifier_groups', {
        filters: { product_id: productIds },
        order: 'id.asc',
        limit: 500,
      })) || []
    : [];
  if (!groups.length) {
    console.log('  ⚠️  No modifier groups found; skipping order item modifiers');
    return;
  }

  const groupIds = [...new Set(groups.map((g) => g.id))];
  const options = (await select('modifier_options', {
    filters: { group_id: groupIds },
    order: 'id.asc',
    limit: 1000,
  })) || [];

  const groupById = new Map(groups.map((g) => [g.id, g]));
  const optionsByGroup = new Map();
  for (const opt of options) {
    if (!optionsByGroup.has(opt.group_id)) optionsByGroup.set(opt.group_id, []);
    optionsByGroup.get(opt.group_id).push(opt);
  }
  const groupsByProduct = new Map();
  for (const g of groups) {
    if (!groupsByProduct.has(g.product_id)) groupsByProduct.set(g.product_id, []);
    groupsByProduct.get(g.product_id).push(g);
  }

  const rows = [];
  let counter = 0;
  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const productGroups = groupsByProduct.get(item.product_id);
    if (!productGroups) continue;
    for (let gi = 0; gi < productGroups.length && gi < 2; gi++) {
      const group = productGroups[gi];
      const groupOptions = optionsByGroup.get(group.id) || [];
      if (!groupOptions.length) continue;
      const opt = groupOptions[(i + gi) % groupOptions.length];
      rows.push({
        id: generateId(seed + 290000 + counter),
        order_item_id: item.id,
        modifier_option_id: opt.id,
        group_name: groupById.get(opt.group_id)?.name || group.name,
        option_name: opt.name,
        price_cents: opt.price_cents,
        organization_id: item.organization_id,
      });
      counter++;
      if (counter >= 500) break;
    }
    if (counter >= 500) break;
  }

  if (!rows.length) {
    console.log('  ⚠️  No order item modifiers resolved');
    return;
  }
  const ok = await upsertBatched('order_item_modifiers', rows, 'id', 'Order item modifier');
  console.log(`  ✅ ${ok} order item modifiers`);
}

async function seedTeamMembers(shops, seed) {
  const orgId = shops[0].organization_id;
  const now = new Date().toISOString();
  const rows = [
    {
      id: generateId(seed + 180000),
      organization_id: orgId,
      clerk_user_id: 'placeholder-demo-admin',
      role: 'admin',
      created_at: now,
    },
    {
      id: generateId(seed + 180001),
      organization_id: orgId,
      clerk_user_id: 'placeholder-demo-member',
      role: 'member',
      created_at: now,
    },
  ];

  const ok = await upsertBatched('organization_members', rows, 'id', 'Team member');
  console.log(`  ✅ ${ok} team members`);
}

async function seedAuditLogEntries(shops, seed) {
  const orgId = shops[0].organization_id;
  const staff = (await select('app_users', { filters: { role: 'admin' }, order: 'id.asc', limit: 5 })) || [];
  const userId = staff.length ? staff[0].id : null;
  const orders = (await select('orders', { order: 'id.asc', limit: 40 })) || [];
  const shopsById = new Map(shops.map((s) => [s.id, s]));

  const templates = [
    { action: 'order.status_changed', resourceType: 'order', details: { to: 'completed' } },
    { action: 'order.refunded', resourceType: 'order', details: { amount: 'partial' } },
    { action: 'promo.created', resourceType: 'promo_code', details: { channel: 'dashboard' } },
    { action: 'shop.updated', resourceType: 'shop', details: { field: 'opening_hours' } },
    { action: 'auth.customer_demo_login', resourceType: 'customer', details: { method: 'demo' } },
    { action: 'settings.updated', resourceType: 'organization', details: { section: 'payments' } },
  ];

  const rows = [];
  for (let i = 0; i < 48; i++) {
    const tpl = templates[i % templates.length];
    const order = orders.length ? orders[i % orders.length] : null;
    const resourceId = tpl.resourceType === 'order' && order
      ? order.id
      : tpl.resourceType === 'shop'
        ? shops[i % shops.length].id
        : null;
    rows.push({
      id: generateId(seed + 310000 + i),
      user_id: userId,
      action: tpl.action,
      resource_type: tpl.resourceType,
      resource_id: resourceId,
      details: {
        ...tpl.details,
        organization_id: orgId,
        shop_id: order ? order.shop_id : shopsById.get(resourceId)?.id || null,
      },
      ip: '127.0.0.1',
      organization_id: orgId,
      created_at: new Date(Date.now() - i * 1800000).toISOString(),
    });
  }

  const ok = await upsertBatched('audit_log', rows, 'id', 'Audit log');
  console.log(`  ✅ ${ok} audit log entries`);
}

async function seedOrganizationHostnames(shops, seed) {
  const orgId = shops[0].organization_id;
  const now = new Date().toISOString();
  const rows = [
    {
      id: generateId(seed + 320000),
      organization_id: orgId,
      hostname: 'demo.customer.dilivygo.com',
      app_surface: 'customer',
      status: 'active',
      is_primary: true,
      verified_at: now,
      tls_status: 'ready',
      provider: 'vercel',
      dns_instructions: {},
      created_at: now,
      updated_at: now,
    },
    {
      id: generateId(seed + 320001),
      organization_id: orgId,
      hostname: 'demo.rider.dilivygo.com',
      app_surface: 'rider',
      status: 'active',
      is_primary: false,
      verified_at: now,
      tls_status: 'ready',
      provider: 'vercel',
      dns_instructions: {},
      created_at: now,
      updated_at: now,
    },
  ];

  const ok = await upsertBatched('organization_hostnames', rows, 'id', 'Organization hostname');
  console.log(`  ✅ ${ok} organization hostnames`);
}

module.exports = { seedDatabase };
