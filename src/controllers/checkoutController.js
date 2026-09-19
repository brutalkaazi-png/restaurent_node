const { User, Branch, CustomerProfile, Order, OrderItem } = require('../models');
const { getSettings } = require('../utils/settingHelper');
const { hashPassword, verifyPassword } = require('../utils/password');
const { notifyRestaurant } = require('../utils/events');

// Ported from app/Http/Controllers/CheckoutController.php

// GET /checkout
async function index(req, res) {
  const cart = req.session.cart;
  const restaurantSlug = req.session.restaurant_slug;

  if (!cart || !Object.keys(cart).length) {
    if (!restaurantSlug) return res.status(404).send('Not found');
    return res.redirect(`/${restaurantSlug}/menu`);
  }

  const restaurant = await User.findOne({ where: { slug: restaurantSlug } });
  const setting = await getSettings();

  return res.render('checkout', {
    currentUser: req.currentUser,
    restaurant,
    cart,
    restaurantName: req.session.restaurant_name,
    restaurantSlug,
    restaurantAddress: req.session.restaurant_address,
    setting,
  });
}

// POST /store_order
async function store(req, res) {
  const cart = req.session.cart || {};
  const resId = req.session.restaurant_id;
  const restaurant = await User.findByPk(resId);

  if (!restaurant) {
    return res.redirect('back');
  }

  let user = req.currentUser;

  // SCENARIO 1: a guest creating a new account at checkout.
  if (!user && req.body.create_account) {
    if (!req.body.name || !req.body.email || !req.body.phone || !req.body.password || req.body.password.length < 6 || req.body.password !== req.body.password_confirmation) {
      return res.status(422).send('Please provide a valid name, email, phone, and matching passwords (min 6 characters).');
    }
    const existing = await User.findOne({ where: { email: req.body.email } });
    if (existing) {
      return res.status(422).send('That email address is already registered.');
    }
    user = await User.create({
      name: req.body.name,
      email: req.body.email,
      phone: req.body.phone,
      password: await hashPassword(req.body.password),
      user_type: 'C',
      status: 'approved',
      address: req.body.delivery_type === 'home_delivery' ? req.body.address : null,
    });
    req.session.userId = user.id;
  }
  // SCENARIO 2: an existing logged-in user.
  else if (user) {
    user.name = req.body.name;
    user.phone = req.body.phone;
    if (req.body.delivery_type === 'home_delivery' && req.body.address) {
      user.address = req.body.address;
    }
    await user.save();
  }
  // SCENARIO 3: guest checkout without an account - `user` stays null.

  // --- Payment ---
  let paymentMode = 'cod';
  let transactionId = null;

  if (req.body.payment_method === 'card' && restaurant.card_payment) {
    if (!restaurant.secret_key) {
      return res.status(400).send('This restaurant has not configured card payments.');
    }
    const stripeToken = req.body.stripeToken;
    if (!stripeToken) {
      return res.status(400).send('Stripe payment could not be completed.');
    }
    try {
      // eslint-disable-next-line global-require
      const stripe = require('stripe')(restaurant.secret_key);
      const paymentIntent = await stripe.paymentIntents.retrieve(stripeToken);
      if (paymentIntent.status !== 'succeeded') {
        return res.status(400).send('Stripe payment failed.');
      }
      paymentMode = 'card';
      transactionId = paymentIntent.id;
    } catch (e) {
      return res.status(500).send(`Payment error: ${e.message}`);
    }
  }

  const order = await Order.create({
    name: req.body.name,
    user_id: user ? user.id : null,
    res_id: resId,
    branch_id: (await Branch.findOne({ where: { restaurant_id: resId, is_active: true }, order: [['id', 'ASC']] }))?.id || null,
    email: req.body.email,
    phone: req.body.phone,
    address: req.body.delivery_type === 'home_delivery' ? req.body.address : null,
    total_cost: req.body.total_cost,
    payment_mode: paymentMode,
    delivery_charge: req.body.delivery_charge,
    time: req.body.delivery_time,
    delivery_type: req.body.delivery_type,
    order_status: 'requested',
    qr_type: 'Order Online QR',
    transaction_id: paymentMode === 'card' ? transactionId : null,
  });

  if (cart && Object.keys(cart).length) {
    for (const [key, c] of Object.entries(cart)) {
      let idString = key;
      if (idString.includes('-t')) idString = idString.slice(0, idString.indexOf('-t'));
      if (idString.includes('-c')) idString = idString.slice(0, idString.indexOf('-c'));
      const [itemId, variantId] = idString.split('-');

      await OrderItem.create({
        order_id: order.id,
        item_id: itemId,
        item_variant_id: variantId || null,
        variant_name: c.variant_name || null,
        price: c.price,
        qty: c.quantity,
        total: c.price * c.quantity,
        remarks: c.comment || null,
        toppings: c.toppings && c.toppings.length ? c.toppings : null,
      });
    }
  }

  const branch = await Branch.findOne({ where: { restaurant_id: resId, is_active: true }, order: [['id', 'ASC']] });
  if (branch && (user || req.body.email || req.body.phone)) {
    const profileWhere = user
      ? { restaurant_id: resId, branch_id: branch.id, customer_user_id: user.id }
      : { restaurant_id: resId, branch_id: branch.id, ...(req.body.email ? { email: req.body.email } : { phone: req.body.phone }) };
    let profile = await CustomerProfile.findOne({ where: profileWhere });
    if (!profile) profile = CustomerProfile.build({ restaurant_id: resId, branch_id: branch.id, customer_user_id: user?.id || null, visit_count: 0, total_spend: 0 });
    profile.name = req.body.name || user?.name || profile.name || 'Guest';
    profile.email = req.body.email || user?.email || profile.email || null;
    profile.phone = req.body.phone || user?.phone || profile.phone || null;
    profile.address = req.body.address || user?.address || profile.address || null;
    profile.visit_count += 1;
    profile.total_spend = parseFloat(profile.total_spend || 0) + parseFloat(req.body.total_cost || 0);
    await profile.save();
  }

  req.session.cart = undefined;
  notifyRestaurant(resId, { reason: 'online-order-requested' });

  // NOTE: OrderAdminEmail / OrderUserEmail sending dropped here - see the
  // email TODO already noted in authController.js / registerController.js.

  return res.redirect(`/order/${order.id}`);
}

// POST /login/store  (inline login form on the checkout page)
async function login(req, res) {
  const { login_email: email, login_pass: password } = req.body;
  if (!email || !password) {
    return res.json({ success: false, error: 'validation', messages: { login_email: ['Email and password are required.'] } });
  }

  const user = await User.findOne({ where: { email } });
  if (!user) {
    return res.json({ success: false, error: 'email' });
  }
  const passwordMatches = await verifyPassword(password, user.password);
  if (!passwordMatches) {
    return res.json({ success: false, error: 'password' });
  }

  req.session.userId = user.id;
  return res.json({ success: true });
}

module.exports = { index, store, login };
