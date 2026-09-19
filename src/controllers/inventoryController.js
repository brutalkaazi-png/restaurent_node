const { sequelize, InventoryItem, InventoryTransaction } = require('../models');

// Ported from app/Http/Controllers/SuperAdmin/InventoryController.php.
// The original gates edit/update/delete/stock-in/stock-out/history behind
// InventoryItemPolicy (a plain "$user->id === $item->user_id" ownership
// check) - replicated here as a findOne with both id and user_id in the
// where clause, so a mismatched owner gets a 404 rather than leaking
// whether the id exists at all (same effective behavior as Laravel's
// route-model-binding + policy combo aborting with 403/404).

const PER_PAGE = 15;

// GET /inventory
async function index(req, res) {
  const page = parseInt(req.query.page, 10) || 1;
  const { count, rows } = await InventoryItem.findAndCountAll({
    where: { user_id: req.currentUser.id },
    order: [['id', 'DESC']],
    limit: PER_PAGE,
    offset: (page - 1) * PER_PAGE,
  });
  return res.render('res/inventory/index', { items: rows, page, totalPages: Math.ceil(count / PER_PAGE) });
}

// GET /inventory/create
function create(req, res) {
  return res.render('res/inventory/create', { errors: [] });
}

// POST /inventory
async function store(req, res) {
  const { name, unit, quantity, price_per_unit: pricePerUnit } = req.body;

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!unit) errors.push('Unit is required.');
  if (quantity === undefined || quantity === '' || quantity < 0) errors.push('Quantity must be zero or more.');

  if (errors.length) {
    return res.status(422).render('res/inventory/create', { errors });
  }

  const t = await sequelize.transaction();
  try {
    const item = await InventoryItem.create(
      { user_id: req.currentUser.id, name, unit, quantity },
      { transaction: t }
    );
    if (parseFloat(quantity) > 0) {
      await InventoryTransaction.create(
        {
          inventory_item_id: item.id,
          user_id: req.currentUser.id,
          type: 'in',
          quantity,
          price_per_unit: pricePerUnit || null,
          notes: 'Initial stock',
        },
        { transaction: t }
      );
    }
    await t.commit();
    return res.redirect('/inventory');
  } catch (e) {
    await t.rollback();
    // eslint-disable-next-line no-console
    console.error('Inventory item creation failed:', e.message);
    return res.status(500).render('res/inventory/create', { errors: ['Something went wrong. Please try again.'] });
  }
}

// GET /inventory/:id/edit
async function edit(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');
  return res.render('res/inventory/edit', { item, errors: [] });
}

// POST /inventory/:id
async function update(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');

  const { name, unit } = req.body;
  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!unit) errors.push('Unit is required.');
  if (errors.length) {
    return res.status(422).render('res/inventory/edit', { item, errors });
  }

  item.name = name;
  item.unit = unit;
  await item.save();
  return res.redirect('/inventory');
}

// POST /inventory/:id/delete
async function destroy(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (item) await item.destroy();
  return res.redirect('/inventory');
}

// GET /inventory/:id/stock-in
async function showStockInForm(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');
  return res.render('res/inventory/stock-in', { item, errors: [] });
}

// POST /inventory/:id/stock-in
async function stockIn(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');

  const { quantity, price_per_unit: pricePerUnit, notes } = req.body;
  const errors = [];
  if (!quantity || quantity < 0.01) errors.push('Quantity must be at least 0.01.');
  if (errors.length) return res.status(422).render('res/inventory/stock-in', { item, errors });

  const t = await sequelize.transaction();
  try {
    await item.increment('quantity', { by: parseFloat(quantity), transaction: t });
    await InventoryTransaction.create(
      { inventory_item_id: item.id, user_id: req.currentUser.id, type: 'in', quantity, price_per_unit: pricePerUnit || null, notes },
      { transaction: t }
    );
    await t.commit();
    return res.redirect('/inventory');
  } catch (e) {
    await t.rollback();
    return res.status(500).render('res/inventory/stock-in', { item, errors: ['Something went wrong. Please try again.'] });
  }
}

// GET /inventory/:id/stock-out
async function showStockOutForm(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');
  return res.render('res/inventory/stock-out', { item, errors: [] });
}

// POST /inventory/:id/stock-out
async function stockOut(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');

  const { quantity, notes } = req.body;
  const errors = [];
  if (!quantity || quantity < 0.01) errors.push('Quantity must be at least 0.01.');
  if (quantity && parseFloat(quantity) > parseFloat(item.quantity)) errors.push(`Quantity cannot exceed the current stock of ${item.quantity} ${item.unit}.`);
  if (!notes) errors.push('Notes are required for stock removal.');
  if (errors.length) return res.status(422).render('res/inventory/stock-out', { item, errors });

  const t = await sequelize.transaction();
  try {
    await item.decrement('quantity', { by: parseFloat(quantity), transaction: t });
    await InventoryTransaction.create(
      { inventory_item_id: item.id, user_id: req.currentUser.id, type: 'out', quantity, notes },
      { transaction: t }
    );
    await t.commit();
    return res.redirect('/inventory');
  } catch (e) {
    await t.rollback();
    return res.status(500).render('res/inventory/stock-out', { item, errors: ['Something went wrong. Please try again.'] });
  }
}

// GET /inventory/:id/history
async function history(req, res) {
  const item = await InventoryItem.findOne({ where: { id: req.params.id, user_id: req.currentUser.id } });
  if (!item) return res.status(404).send('Not found');

  const page = parseInt(req.query.page, 10) || 1;
  const perPage = 20;
  const { count, rows } = await InventoryTransaction.findAndCountAll({
    where: { inventory_item_id: item.id },
    order: [['created_at', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
  });

  return res.render('res/inventory/history', { item, transactions: rows, page, totalPages: Math.ceil(count / perPage) });
}

module.exports = {
  index,
  create,
  store,
  edit,
  update,
  destroy,
  showStockInForm,
  stockIn,
  showStockOutForm,
  stockOut,
  history,
};
