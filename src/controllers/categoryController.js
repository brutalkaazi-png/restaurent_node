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

// POST /categories  (upsert: creates and updates, supports AJAX modal and standard submit)
async function store(req, res) {
  try {
    const id = req.body.id;
    let category = id
      ? await Category.findOne({ where: { id, user_id: req.tenantId, branch_id: req.branchId } })
      : Category.build({ user_id: req.tenantId, branch_id: req.branchId });

    if (!category) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Category not found.' });
      }
      return res.status(404).send('Category not found');
    }

    category.user_id = req.tenantId;
    category.branch_id = req.branchId;
    category.category_name = req.body.category_name?.trim();
    category.category_description = req.body.description?.trim() || null;

    // Auto-assign the next order index if new
    if (!id && !category.category_order) {
      const maxOrder = await Category.max('category_order', {
        where: { user_id: req.tenantId, branch_id: req.branchId },
      });
      category.category_order = (maxOrder || 0) + 1;
    }

    if (req.file) {
      category.category_image = relativePathFor(req.file, 'images');
    }

    await category.save();

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, category });
    }
    return res.redirect('/categories');
  } catch (error) {
    console.error('Error saving category:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: error.message });
    }
    return res.status(500).send('Error saving category');
  }
}

// POST /categories/:id/delete  (DELETE with foreign-key safe check and AJAX support)
async function destroy(req, res) {
  try {
    const category = await Category.findOne({
      where: { id: req.params.id, user_id: req.tenantId, branch_id: req.branchId },
    });

    if (!category) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Category not found.' });
      }
      return res.redirect('/categories');
    }

    // Safety check: Prevent deleting if items still belong to this category
    const itemCount = await Item.count({
      where: { item_category: category.id, user_id: req.tenantId, branch_id: req.branchId },
    });

    if (itemCount > 0) {
      const msg = `Cannot delete "${category.category_name}" because it still contains ${itemCount} menu item(s). Reassign or delete those items first.`;
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(400).json({ success: false, message: msg });
      }
      return res.redirect('/categories?error=' + encodeURIComponent(msg));
    }

    await category.destroy();

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true });
    }
    return res.redirect('/categories');
  } catch (error) {
    console.error('Category delete error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Server error while deleting category.' });
    }
    return res.redirect('/categories');
  }
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
