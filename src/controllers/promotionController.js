const { Op } = require('sequelize');
const { Item, Category, Promotion, PromotionItem } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');

// Ported from app/Http/Controllers/SuperAdmin/PromotionController.php

// GET /promotions
async function index(req, res) {
  const promotions = await Promotion.findAll({ where: { restaurant_id: req.currentUser.id } });
  return res.render('res/promotion/index', { promotions });
}

// GET /promotions/create
async function create(req, res) {
  const categories = await Category.findAll({
    where: { user_id: req.currentUser.id },
    include: [{ model: Item, as: 'items' }],
    order: [['category_order', 'ASC']],
  });
  return res.render('res/promotion/create', { categories, promotion: null, promotionItems: {}, errors: [] });
}

// POST /promotions  (upsert via optional hidden promotion_id, same convention the original uses)
async function store(req, res) {
  const restaurantId = req.currentUser.id;
  const {
    name,
    start_date: startDate,
    end_date: endDate,
    start_time: startTime,
    end_time: endTime,
    is_active: isActive,
    promotion_id: promotionId,
  } = req.body;
  const days = Array.isArray(req.body.days) ? req.body.days : req.body.days ? [req.body.days] : [];
  const itemIds = Array.isArray(req.body.item_ids) ? req.body.item_ids : req.body.item_ids ? [req.body.item_ids] : [];
  // NOTE: intentionally NOT using `offer_price[<item_id>]` bracket notation
  // here. `qs` (which `express.urlencoded({extended:true})` uses) silently
  // converts an all-numeric-key bracket object into an array instead of a
  // plain object - `offer_price[1]=6.50` does not reliably become
  // `{ "1": "6.50" }`. Caught this with a live curl test where offer_price
  // came back as `["6.50"]` instead of the expected keyed object, so the
  // form (res/promotion/create.ejs) uses flat `offer_price_<item_id>`
  // fields instead and they're reassembled into a map here.
  const offerPrices = {};
  Object.keys(req.body)
    .filter((key) => key.startsWith('offer_price_'))
    .forEach((key) => {
      offerPrices[key.slice('offer_price_'.length)] = req.body[key];
    });

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!days.length) errors.push('Select at least one day.');
  if (!startDate) errors.push('Start date is required.');
  if (!endDate || endDate < startDate) errors.push('End date must be on or after start date.');
  if (!['Active', 'Inactive'].includes(isActive)) errors.push('Status must be Active or Inactive.');
  if (!itemIds.length) errors.push('Select at least one item.');
  for (const id of itemIds) {
    if (offerPrices[id] === undefined || offerPrices[id] === '') errors.push('Every selected item needs an offer price.');
  }

  if (errors.length) {
    const categories = await Category.findAll({
      where: { user_id: restaurantId },
      include: [{ model: Item, as: 'items' }],
      order: [['category_order', 'ASC']],
    });
    return res.status(422).render('res/promotion/create', { categories, promotion: null, promotionItems: {}, errors });
  }

  let promotion;
  if (promotionId) {
    promotion = await Promotion.findOne({ where: { id: promotionId, restaurant_id: restaurantId } });
    if (!promotion) return res.status(403).send('Forbidden');
  } else {
    promotion = Promotion.build({ restaurant_id: restaurantId });
  }

  let slug = req.body.slug ? sanitizeString(req.body.slug) : sanitizeString(name);
  const existingSlugs = (
    await Promotion.findAll({ where: { slug: { [Op.like]: `%${slug}%` } }, attributes: ['slug'] })
  ).map((p) => p.slug);
  if (slug !== promotion.slug) {
    let i = 2;
    while (existingSlugs.includes(slug)) {
      slug = `${slug}-${i}`;
      i++;
    }
  }

  promotion.name = name;
  promotion.slug = slug;
  promotion.days = days;
  promotion.start_date = startDate;
  promotion.end_date = endDate;
  promotion.start_time = startTime || null;
  promotion.end_time = endTime || null;
  promotion.is_active = isActive;
  await promotion.save();

  await PromotionItem.destroy({ where: { promotion_id: promotion.id } });
  for (const itemId of itemIds) {
    await PromotionItem.create({ promotion_id: promotion.id, item_id: itemId, offer_price: offerPrices[itemId] });
  }

  return res.redirect('/promotions');
}

// GET /promotions/:id/edit
async function edit(req, res) {
  const promotion = await Promotion.findOne({
    where: { id: req.params.id, restaurant_id: req.currentUser.id },
    include: [{ association: 'items', include: [{ association: 'item' }] }],
  });
  if (!promotion) return res.status(404).send('Not found');

  const categories = await Category.findAll({
    where: { user_id: req.currentUser.id },
    include: [{ model: Item, as: 'items' }],
    order: [['category_order', 'ASC']],
  });

  const promotionItems = {};
  promotion.items.forEach((pi) => {
    promotionItems[pi.item_id] = pi.offer_price;
  });

  return res.render('res/promotion/create', { categories, promotion, promotionItems, errors: [] });
}

// POST /promotions/:id/delete
async function destroy(req, res) {
  const promotion = await Promotion.findOne({ where: { id: req.params.id, restaurant_id: req.currentUser.id } });
  if (promotion) {
    await PromotionItem.destroy({ where: { promotion_id: promotion.id } });
    await promotion.destroy();
  }
  return res.redirect('/promotions');
}

module.exports = { index, create, store, edit, destroy };
