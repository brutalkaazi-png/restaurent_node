const { Subscription } = require('../models');
const { relativePathFor } = require('../utils/mediaHelper');

// Ported from app/Http/Controllers/SuperAdmin/AddSubscriptionController.php -
// platform admin CRUD for the subscription *plans* restaurants can buy
// (distinct from res/subscriptionController.js's per-restaurant
// UserSubscription switching, which isn't ported in this pass - see README).

// GET /superadmin/subscriptions
async function index(req, res) {
  const subscriptions = await Subscription.findAll({ where: { del_status: 0 }, order: [['id', 'DESC']] });
  return res.render('superadmin/subscriptions/index', { subscriptions });
}

// GET /superadmin/subscriptions/create
function create(req, res) {
  return res.render('superadmin/subscriptions/create', { subscription: null });
}

// GET /superadmin/subscriptions/:id/edit
async function edit(req, res) {
  const subscription = await Subscription.findByPk(req.params.id);
  if (!subscription) return res.status(404).send('Not found');
  return res.render('superadmin/subscriptions/create', { subscription });
}

// POST /superadmin/subscriptions  (upsert via hidden id field, same convention used elsewhere in this port)
async function store(req, res) {
  const id = req.body.id;
  const subscription = id ? await Subscription.findByPk(id) : Subscription.build();

  subscription.name = req.body.name;
  subscription.subscription_type = req.body.subscription_type;
  subscription.month = req.body.month;
  subscription.cost = req.body.cost;
  if (req.file) {
    subscription.image = relativePathFor(req.file, 'images');
  }
  await subscription.save();

  return res.redirect('/superadmin/subscriptions');
}

// POST /superadmin/subscriptions/:id/delete  (soft delete - matches del_status flag)
async function destroy(req, res) {
  const subscription = await Subscription.findByPk(req.params.id);
  if (subscription) {
    subscription.del_status = 1;
    await subscription.save();
  }
  return res.redirect('/superadmin/subscriptions');
}

module.exports = { index, create, edit, store, destroy };
