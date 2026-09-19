const { Op } = require('sequelize');
const { sequelize, Category, Item, ItemVariant, Topping } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');
const { relativePathFor } = require('../utils/mediaHelper');
const { getSettings } = require('../utils/settingHelper');
const { notifyRestaurant } = require('../utils/events');

// GET /menus?category_id=
async function index(req, res) {
  const categories = await Category.findAll({
    where: { user_id: req.tenantId, branch_id: req.branchId },
    order: [['category_order', 'ASC']],
  });

  const where = { user_id: req.tenantId, branch_id: req.branchId };
  if (req.query.category_id) where.item_category = req.query.category_id;

  const menus = await Item.findAll({ where, order: [['item_order', 'ASC']] });
  const setting = await getSettings();

  return res.render('res/menu/index', { menus, setting, categories, selectedCategoryId: req.query.category_id || '' });
}

// GET /menus/create
async function create(req, res) {
  const categories = await Category.findAll({
    where: { user_id: req.tenantId, branch_id: req.branchId },
    order: [['category_order', 'ASC']],
  });
  return res.render('res/menu/create', { categories, menu: null });
}

// GET /menus/:id/edit
async function edit(req, res) {
  const categories = await Category.findAll({
    where: { user_id: req.tenantId, branch_id: req.branchId },
    order: [['category_order', 'ASC']],
  });
  const menu = await Item.findOne({ where: { id: req.params.id, user_id: req.tenantId, branch_id: req.branchId },
    include: [{ association: 'variants' }, { association: 'toppings' }],
  });
  if (!menu) return res.status(404).send('Menu item not found');
  return res.render('res/menu/create', { categories, menu });
}

// POST /menus  (upsert - same pattern as the Laravel store())
async function store(req, res) {
  const t = await sequelize.transaction();
  try {
    const id = req.body.id;
    const menu = id
      ? await Item.findOne({ where: { id, user_id: req.tenantId, branch_id: req.branchId }, transaction: t })
      : Item.build({ user_id: req.tenantId, branch_id: req.branchId });
    if (!menu) throw new Error('Menu item not found.');

    const rawSlug = req.body.item_slug || req.body.item_name;
    let slug = sanitizeString(rawSlug);
    const existingSlugs = (
      await Item.findAll({ where: { user_id: req.tenantId, branch_id: req.branchId, item_slug: { [Op.like]: `%${slug}%` } }, attributes: ['item_slug'], transaction: t })
    ).map((i) => i.item_slug);

    if (slug !== menu.item_slug) {
      let i = 2;
      while (existingSlugs.includes(slug)) {
        slug = `${slug}-${i}`;
        i++;
      }
    }

    menu.user_id = req.tenantId;
    menu.branch_id = req.branchId;
    menu.item_name = req.body.item_name;
    menu.item_slug = slug;
    menu.item_description = req.body.description;
    menu.item_category = req.body.item_category;
    menu.is_drink = req.body.is_drink === 'on' || req.body.is_drink === 'true' || req.body.is_drink === true;
    menu.has_variants = req.body.has_variants === 'on' || req.body.has_variants === 'true' || req.body.has_variants === true;
    menu.has_toppings = req.body.has_toppings === 'on' || req.body.has_toppings === 'true' || req.body.has_toppings === true;

    menu.price = menu.has_variants ? null : Math.round(parseFloat(req.body.price || 0));

    if (req.file) {
      menu.item_image = relativePathFor(req.file, 'images');
    }

    await menu.save({ transaction: t });

    // Variants
    await ItemVariant.destroy({ where: { item_id: menu.id }, transaction: t });
    if (menu.has_variants && Array.isArray(req.body.variants)) {
      for (const v of req.body.variants) {
        if (v && v.name && v.price !== undefined && v.price !== null && v.price !== '') {
          await ItemVariant.create({ item_id: menu.id, name: v.name, price: v.price }, { transaction: t });
        }
      }
    }

    // Toppings
    await Topping.destroy({ where: { item_id: menu.id }, transaction: t });
    if (menu.has_toppings && Array.isArray(req.body.toppings)) {
      for (const tp of req.body.toppings) {
        if (tp && tp.name && tp.price !== undefined && tp.price !== null && tp.price !== '') {
          await Topping.create({ item_id: menu.id, name: tp.name, price: tp.price }, { transaction: t });
        }
      }
    }

    await t.commit();
    return res.redirect('/menus');
  } catch (e) {
    await t.rollback();
    // eslint-disable-next-line no-console
    console.error('Menu save failed:', e.message);
    return res.status(500).render('res/menu/create', { categories: [], menu: null, error: `Something went wrong: ${e.message}` });
  }
}

// POST /menus/:id/delete
async function destroy(req, res) {
  const menu = await Item.findOne({ where: { id: req.params.id, user_id: req.tenantId, branch_id: req.branchId } });
  if (menu) await menu.destroy();
  return res.redirect('/menus');
}

// POST /menus/:id/toggle-sold-out
async function toggleSoldOut(req, res) {
  const menu = await Item.findOne({ where: { id: req.params.id, user_id: req.tenantId, branch_id: req.branchId } });
  if (!menu) return res.status(404).json({ success: false, message: 'Menu item not found.' });

  menu.sold_out = !menu.sold_out;
  await menu.save();
  notifyRestaurant(req.currentUser.id, { reason: 'menu-update' });

  if (req.accepts('html')) return res.redirect('/menus');
  return res.json({ success: true, sold_out: menu.sold_out });
}

// POST /menu/update-order  { order_ids: [{id, order}, ...] }
async function storeOrder(req, res) {
  const orders = req.body.order_ids;
  if (orders && orders.length) {
    await Promise.all(orders.map((o) => Item.update({ item_order: o.order }, { where: { id: o.id, user_id: req.tenantId, branch_id: req.branchId } })));
    return res.json({ success: true });
  }
  return res.json({ success: false });
}

// NOTE: qr_code()/generate_qrcode() from the original (uses App\Helpers\QRHelper,
// which isn't ported) are intentionally left out - add a QR-code npm
// package (e.g. `qrcode`) and wire up /qrcode/:id and /generate-qrcode
// here if you need that back.

module.exports = { index, create, edit, store, destroy, toggleSoldOut, storeOrder };
