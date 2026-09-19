const { Category, Item, ItemVariant, Topping, User, MenuTemplate, UserSubscription } = require('../models');

// Ported from app/Http/Controllers/HomeController.php. Note this is a
// *separate* cart mechanism from TableMenuController's - that one persists
// each line as a `TableCustomer` DB row tied to a physical table; this one
// is a plain session-stored cart for delivery/pickup (no table involved),
// matching the original's session('cart') array exactly.

// GET /{slug}/menu  (online delivery/pickup menu - NOT the table QR menu)
async function showMenu(req, res) {
  const restaurant = await User.findOne({ where: { slug: req.params.slug, status: 'approved' } });
  if (!restaurant) return res.status(404).send('Not found');

  const allMenus = await Item.findAll({
    where: { user_id: restaurant.id },
    include: [{ association: 'variants' }, { association: 'toppings' }],
    order: [['item_order', 'ASC']],
  });

  // See the same note in tableMenuController.js's showTableMenu() - this
  // wires up discount display that exists in the original's model layer
  // but was never actually connected to any view.
  for (const item of allMenus) {
    const activeDiscount = await item.getActiveDiscount();
    item.active_discount = activeDiscount;
    item.discounted_price = activeDiscount ? item.getDiscountedPrice(activeDiscount) : null;
  }

  req.session.restaurant_id = restaurant.id;
  req.session.restaurant_name = restaurant.name;
  req.session.restaurant_slug = restaurant.slug;
  req.session.restaurant_address = restaurant.address;
  req.session.delivery_charge = restaurant.delivery_charge;

  const categories = await Category.findAll({ where: { user_id: restaurant.id }, order: [['category_order', 'ASC']] });

  const subscription = await UserSubscription.findOne({
    where: { user_id: restaurant.id, payment_status: 'paid', subscription_status: 'active' },
    include: [{ association: 'subscription' }],
    order: [['id', 'DESC']],
  });
  let isSubscribed = false;
  let usersub = '';
  if (subscription) {
    const now = new Date();
    const start = new Date(subscription.subscription_start_date);
    const end = new Date(subscription.subscription_end_date);
    if (now >= start && now <= end) {
      isSubscribed = true;
      if (subscription.subscription) usersub = subscription.subscription.name;
    }
  }

  let menuTemplate = await MenuTemplate.findOne({ where: { user_id: restaurant.id } });
  if (!menuTemplate) menuTemplate = { template_id: 1, show_product_image: false, show_category_image: false };

  return res.render('menu/online', { restaurant, usersub, allMenus, categories, isSubscribed, menuTemplate });
}

// GET /get-variants/:item
async function getVariants(req, res) {
  const variants = await ItemVariant.findAll({ where: { item_id: req.params.item } });
  return res.json(variants);
}

// GET /get-toppings/:item
async function getToppings(req, res) {
  const toppings = await Topping.findAll({ where: { item_id: req.params.item } });
  return res.json(toppings);
}

// POST /add-to-cart
async function addToCart(req, res) {
  const cart = req.session.cart || {};
  const itemsToAdd = req.body.items || [];

  for (const itemData of itemsToAdd) {
    const { item_id: itemId, variant_id: variantId, quantity, comment = '', toppings = [] } = itemData;
    const item = await Item.findByPk(itemId);
    if (!item) continue;
    if (item.sold_out) return res.status(409).json({ success: false, message: `${item.item_name} is sold out.` });

    let cartKey = String(itemId);
    let itemName = item.item_name;
    let itemPrice = parseFloat(item.price || 0);
    let variantName = null;

    if (variantId) {
      const variant = await ItemVariant.findByPk(variantId);
      if (!variant) continue;
      cartKey += `-${variantId}`;
      itemName += ` (${variant.name})`;
      itemPrice = parseFloat(variant.price);
      variantName = variant.name;
    } else {
      // Same discount rule as tableMenuController.addTableMenu(): only the
      // item's base price is ever discounted, never a variant price.
      const activeDiscount = await item.getActiveDiscount();
      if (activeDiscount) itemPrice = item.getDiscountedPrice(activeDiscount);
    }

    let toppingPrice = 0;
    const toppingDetails = [];
    if (toppings.length) {
      const selectedToppings = await Topping.findAll({ where: { id: toppings } });
      selectedToppings.forEach((t) => {
        toppingPrice += parseFloat(t.price);
        toppingDetails.push({ id: t.id, name: t.name, price: t.price });
      });
      const sortedToppingIds = toppings.slice().sort((a, b) => a - b);
      cartKey += `-t${sortedToppingIds.join('-')}`;
    }

    const fullComment = String(comment).trim();
    if (fullComment) {
      cartKey += `-c${crc32(fullComment)}`;
    }

    if (cart[cartKey]) {
      cart[cartKey].quantity += quantity;
    } else {
      cart[cartKey] = {
        name: itemName,
        price: itemPrice + toppingPrice,
        quantity,
        comment: fullComment,
        variant_name: variantName,
        toppings: toppingDetails,
      };
    }
  }

  req.session.cart = cart;
  return res.json({ success: 'Items added to cart successfully.', totalItem: Object.keys(cart).length });
}

// GET /get-cart
function getCart(req, res) {
  const cart = req.session.cart || {};
  const restaurantName = req.session.restaurant_name;
  const restaurantAddress = req.session.restaurant_address;
  res.render(
    'cart',
    { cart, restaurantName, restaurantAddress, layout: false },
    (err, html) => {
      if (err) throw err;
      res.json({ html, cart: JSON.stringify(cart), restaurantName, restaurantAddress });
    }
  );
}

// GET /delete_order/:id  (removes one line from the session cart by its composite key)
function deleteOrder(req, res) {
  const cart = req.session.cart || {};
  if (cart[req.params.id]) {
    delete cart[req.params.id];
    req.session.cart = cart;
  }
  return res.json({ success: true, message: 'Item removed from cart.' });
}

// GET /thank-you
function thankyou(req, res) {
  res.render('thankyou-simple');
}

// Small CRC32 implementation (Node has no builtin) matching PHP's crc32(),
// used only to build a stable per-comment cart key exactly like the
// original's `crc32($full_comment)`.
function crc32(str) {
  let crc = ~0;
  for (let i = 0; i < str.length; i++) {
    crc ^= str.charCodeAt(i);
    for (let j = 0; j < 8; j++) {
      crc = (crc >>> 1) ^ (0xedb88320 & -(crc & 1));
    }
  }
  return (~crc) >>> 0;
}

module.exports = { showMenu, getVariants, getToppings, addToCart, getCart, deleteOrder, thankyou };
