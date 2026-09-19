const { sequelize, Category, Item } = require('../models');
const { relativePathFor } = require('../utils/mediaHelper');

// GET /categories
async function index(req, res) {
  const categories = await Category.findAll({
    where: { user_id: req.tenantId, branch_id: req.branchId },
    order: [['category_order', 'ASC']],
  });
  const counts = await Item.findAll({
    attributes: ['item_category', [sequelize.fn('COUNT', sequelize.col('id')), 'count']],
    where: { user_id: req.tenantId, branch_id: req.branchId },
    group: ['item_category'],
  });
  const countByCategory = {};
  counts.forEach((c) => {
    countByCategory[c.item_category] = parseInt(c.get('count'), 10);
  });
  const categoriesWithCounts = categories.map((c) => {
    const plain = c.get({ plain: true });
    plain.item_count = countByCategory[c.id] || 0;
    return plain;
  });

  return res.render('res/category/index', { categories: categoriesWithCounts });
}

// GET /categories/create
function create(req, res) {
  return res.render('res/category/create', { category: null });
}

// GET /categories/:id/edit
async function edit(req, res) {
  const category = await Category.findOne({ where: { id: req.params.id, user_id: req.tenantId, branch_id: req.branchId } });
  if (!category) return res.status(404).send('Category not found');
  return res.render('res/category/create', { category });
}

// POST /categories  (upsert, same as the Laravel controller: store() both creates and updates)
async function store(req, res) {
  const id = req.body.id;
  let category = id
    ? await Category.findOne({ where: { id, user_id: req.tenantId, branch_id: req.branchId } })
    : Category.build({ user_id: req.tenantId, branch_id: req.branchId });
  if (!category) return res.status(404).send('Category not found');

  category.user_id = req.tenantId;
  category.branch_id = req.branchId;
  category.category_name = req.body.category_name;
  category.category_description = req.body.description;

  if (req.file) {
    category.category_image = relativePathFor(req.file, 'images');
  }

  await category.save();
  return res.redirect('/categories');
}

// POST /categories/:id/delete  (DELETE via resource route in the original)
async function destroy(req, res) {
  const category = await Category.findOne({ where: { id: req.params.id, user_id: req.tenantId, branch_id: req.branchId } });
  if (category) await category.destroy();
  return res.redirect('/categories');
}

// POST /category/update-order  { order_ids: [{id, order}, ...] }
async function storeOrder(req, res) {
  const orders = req.body.order_ids;
  if (orders && orders.length) {
    await Promise.all(orders.map((o) => Category.update({ category_order: o.order }, { where: { id: o.id, user_id: req.tenantId, branch_id: req.branchId } })));
    return res.json({ success: true });
  }
  return res.json({ success: false });
}

module.exports = { index, create, edit, store, destroy, storeOrder };
