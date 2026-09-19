const { Category, Item, Discount } = require('../models');

// Ported from app/Http/Controllers/SuperAdmin/DiscountController.php

const DAYS = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];

// GET /discounts
async function index(req, res) {
  const discounts = await Discount.findAll({
    where: { restaurant_id: req.currentUser.id },
    include: [{ association: 'items' }],
    order: [['start_time', 'ASC']],
  });
  return res.render('res/discount/index', { discounts });
}

// GET /discounts/create
async function create(req, res) {
  const categories = await Category.findAll({
    where: { user_id: req.currentUser.id },
    include: [{ model: Item, as: 'items' }],
    order: [['category_order', 'ASC']],
  });
  return res.render('res/discount/create', { days: DAYS, categories, discount: null, discountItems: [], errors: [] });
}

// POST /discounts
async function store(req, res) {
  const { start_time: startTime, end_time: endTime, discount_percentage: discountPercentage } = req.body;
  const days = Array.isArray(req.body.days) ? req.body.days : req.body.days ? [req.body.days] : [];
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids : req.body.item_ids ? [req.body.item_ids] : [];

  const errors = [];
  if (!startTime) errors.push('Start time is required.');
  if (!endTime || (startTime && endTime <= startTime)) errors.push('End time must be after start time.');
  if (!discountPercentage || discountPercentage < 1 || discountPercentage > 100) errors.push('Discount percentage must be between 1 and 100.');
  if (!days.length) errors.push('Select at least one day.');
  if (!itemIds.length) errors.push('Select at least one item.');

  if (errors.length) {
    const categories = await Category.findAll({
      where: { user_id: req.currentUser.id },
      include: [{ model: Item, as: 'items' }],
      order: [['category_order', 'ASC']],
    });
    return res.status(422).render('res/discount/create', { days: DAYS, categories, discount: null, discountItems: [], errors });
  }

  const discount = await Discount.create({
    restaurant_id: req.currentUser.id,
    start_time: `${startTime}:00`,
    end_time: `${endTime}:00`,
    discount_percentage: discountPercentage,
    days,
  });
  await discount.setItems(itemIds);

  return res.redirect('/discounts');
}

// GET /discounts/:id/edit
async function edit(req, res) {
  const discount = await Discount.findOne({ where: { id: req.params.id, restaurant_id: req.currentUser.id } });
  if (!discount) return res.status(403).send('Forbidden');

  const categories = await Category.findAll({
    where: { user_id: req.currentUser.id },
    include: [{ model: Item, as: 'items' }],
    order: [['category_order', 'ASC']],
  });
  const discountItems = (await discount.getItems({ attributes: ['id'] })).map((i) => i.id);

  return res.render('res/discount/create', { days: DAYS, categories, discount, discountItems, errors: [] });
}

// POST /discounts/:id  (update)
async function update(req, res) {
  const discount = await Discount.findOne({ where: { id: req.params.id, restaurant_id: req.currentUser.id } });
  if (!discount) return res.status(403).send('Forbidden');

  const { start_time: startTime, end_time: endTime, discount_percentage: discountPercentage } = req.body;
  const days = Array.isArray(req.body.days) ? req.body.days : req.body.days ? [req.body.days] : [];
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids : req.body.item_ids ? [req.body.item_ids] : [];

  const errors = [];
  if (!startTime) errors.push('Start time is required.');
  if (!endTime || (startTime && endTime <= startTime)) errors.push('End time must be after start time.');
  if (!discountPercentage || discountPercentage < 1 || discountPercentage > 100) errors.push('Discount percentage must be between 1 and 100.');
  if (!days.length) errors.push('Select at least one day.');
  if (!itemIds.length) errors.push('Select at least one item.');

  if (errors.length) {
    const categories = await Category.findAll({
      where: { user_id: req.currentUser.id },
      include: [{ model: Item, as: 'items' }],
      order: [['category_order', 'ASC']],
    });
    return res.status(422).render('res/discount/create', { days: DAYS, categories, discount, discountItems: itemIds, errors });
  }

  discount.start_time = `${startTime}:00`;
  discount.end_time = `${endTime}:00`;
  discount.discount_percentage = discountPercentage;
  discount.days = days;
  await discount.save();
  await discount.setItems(itemIds);

  return res.redirect('/discounts');
}

// POST /discounts/:id/delete
async function destroy(req, res) {
  const discount = await Discount.findOne({ where: { id: req.params.id, restaurant_id: req.currentUser.id } });
  if (discount) await discount.destroy();
  return res.redirect('/discounts');
}

module.exports = { index, create, store, edit, update, destroy };
