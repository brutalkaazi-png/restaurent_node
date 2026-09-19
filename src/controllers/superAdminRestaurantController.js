const { Op } = require('sequelize');
const { User, Subscription, UserSubscription, OrderItem, Order, Item } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');
const { relativePathFor } = require('../utils/mediaHelper');
const { getSettings } = require('../utils/settingHelper');

// Ported from app/Http/Controllers/SuperAdmin/RestaurantController.php

// GET /superadmin/restaurants
async function index(req, res) {
  const { query = '', status = '', subscription_status: subscriptionStatus = '', subscription_type: subscriptionType = '' } = req.query;
  const page = parseInt(req.query.page, 10) || 1;
  const perPage = 10;

  const where = { user_type: 'R', del_status: 0 };
  if (status) where.status = status;
  if (query) {
    where[Op.or] = [{ name: { [Op.like]: `%${query}%` } }, { phone: { [Op.like]: `%${query}%` } }];
  }

  // NOTE: date_period/selected_date filtering from the original isn't
  // wired up here - this list is the more commonly used part of the
  // screen; add applyDateFilter (see superAdminDashboardController.js for
  // the same logic already written) if you need it back.

  const include = [];
  if (subscriptionStatus === 'subscribed') {
    include.push({
      model: UserSubscription,
      as: 'user_subscriptions',
      where: { subscription_status: 'active' },
      required: true,
    });
  } else if (subscriptionStatus === 'unsubscribed') {
    const subscribedIds = (
      await UserSubscription.findAll({ where: { subscription_status: 'active' }, attributes: ['user_id'] })
    ).map((s) => s.user_id);
    where.id = { [Op.notIn]: subscribedIds.length ? subscribedIds : [0] };
  }
  if (subscriptionType) {
    include.push({
      model: UserSubscription,
      as: 'user_subscriptions',
      where: { subscription_id: subscriptionType, subscription_status: 'active' },
      required: true,
    });
  }

  const { count, rows } = await User.findAndCountAll({
    where,
    include,
    order: [['created_at', 'DESC']],
    limit: perPage,
    offset: (page - 1) * perPage,
    distinct: true,
  });

  const restaurants = [];
  for (const restaurant of rows) {
    const activeSubscription = await UserSubscription.findOne({
      where: { user_id: restaurant.id, subscription_status: 'active' },
      include: [{ association: 'subscription' }],
      order: [['created_at', 'DESC']],
    });
    const plain = restaurant.get({ plain: true });
    plain.has_subscription = !!activeSubscription;
    plain.subscription_name = activeSubscription && activeSubscription.subscription ? activeSubscription.subscription.name : null;
    restaurants.push(plain);
  }

  const subscriptionTypes = await Subscription.findAll({ where: { del_status: 0 } });

  return res.render('superadmin/restaurants/index', {
    restaurants,
    totalPages: Math.ceil(count / perPage),
    page,
    query,
    status,
    subscriptionStatus,
    subscriptionType,
    subscriptionTypes,
  });
}

// POST /superadmin/restaurant-change-status
async function storeStatus(req, res) {
  const restaurant = await User.findByPk(req.body.res_id);
  if (!restaurant) return res.status(404).send('Not found');
  restaurant.status = req.body.status;
  await restaurant.save();

  // NOTE: StatusChangeEmail send dropped here - see the email TODO
  // pattern already noted throughout this project.

  return res.redirect('/superadmin/restaurants');
}

// GET /superadmin/view-subscription/:id
async function viewSubscription(req, res) {
  const userSubscriptions = await UserSubscription.findAll({
    where: { user_id: req.params.id },
    include: [{ association: 'subscription' }],
  });
  const setting = await getSettings();
  return res.render('superadmin/restaurants/view-subscription', { userSubscriptions, setting });
}

// GET /superadmin/view-order-detail/:id
async function viewOrderDetail(req, res) {
  const orderDetails = await OrderItem.findAll({
    include: [
      { model: Order, as: 'order', where: { res_id: req.params.id }, required: true },
      { model: Item, as: 'item' },
    ],
  });
  const setting = await getSettings();
  return res.render('superadmin/restaurants/view-order-detail', { orderDetails, setting });
}

// GET /superadmin/restaurant/edit/:id
async function edit(req, res) {
  const restaurant = await User.findByPk(req.params.id);
  if (!restaurant) return res.status(404).send('Not found');
  return res.render('superadmin/restaurants/edit', { restaurant, error: null });
}

// POST /superadmin/restaurant/update/:id
async function update(req, res) {
  const restaurant = await User.findByPk(req.params.id);
  if (!restaurant) return res.status(404).send('Not found');

  if (req.body.email !== restaurant.email) {
    const existing = await User.findOne({ where: { email: req.body.email } });
    if (existing) {
      return res.status(422).render('superadmin/restaurants/edit', { restaurant, error: 'Email already exists!' });
    }
  }

  let slug = req.body.slug ? sanitizeString(req.body.slug) : sanitizeString(req.body.name);
  const existingSlugs = (
    await User.findAll({ where: { slug: { [Op.like]: `%${slug}%` } }, attributes: ['slug'] })
  ).map((u) => u.slug);
  if (slug !== restaurant.slug) {
    let i = 2;
    while (existingSlugs.includes(slug)) {
      slug = `${slug}-${i}`;
      i++;
    }
  }

  restaurant.name = req.body.name;
  restaurant.slug = slug;
  restaurant.email = req.body.email;
  restaurant.address = req.body.address;
  restaurant.phone = req.body.phone;
  restaurant.user_type = 'R';
  if (req.files && req.files.image && req.files.image[0]) {
    restaurant.image = relativePathFor(req.files.image[0], 'images');
  }
  if (req.files && req.files.logo && req.files.logo[0]) {
    restaurant.logo = relativePathFor(req.files.logo[0], 'images');
  }
  restaurant.status = 'approved';
  await restaurant.save();

  return res.redirect('/superadmin/restaurants');
}

// DELETE /superadmin/restaurant/delete/:id  (soft delete - matches the original's del_status flag)
async function destroy(req, res) {
  const restaurant = await User.findByPk(req.params.id);
  if (restaurant) {
    restaurant.del_status = 1;
    await restaurant.save();
  }
  return res.redirect('/superadmin/restaurants');
}

module.exports = { index, storeStatus, viewSubscription, viewOrderDetail, edit, update, destroy };
