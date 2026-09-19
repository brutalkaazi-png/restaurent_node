const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Category,
  Item,
  ItemVariant,
  Topping,
  RestaurantTable,
  TableCustomer,
  Order,
  OrderItem,
  MenuTemplate,
  UserSubscription,
  Promotion,
  PromotionItem,
} = require('../models');
const cache = require('../utils/cacheStore');
const { newOrderPlaced } = require('../utils/events');

/* ------------------------------------------------------------------ *
 * Ported from app/Http/Controllers/TableMenuController.php.
 *
 * One design change from the PHP original: Laravel's version fetches the
 * table + restaurant via a single ambiguous `RestaurantTable::join('users',
 * ...)->select('users.*', 'restaurant_tables.*', ...)` query, relying on
 * MySQL's "last column wins" behaviour for duplicate names (both tables
 * have `id`/`status`). Here we load them as two related Sequelize models
 * (`table` and `table.restaurant`) and reference each field on its actual
 * owning row - functionally identical, but not dependent on column-name
 * collision order.
 * ------------------------------------------------------------------ */

function randomToken() {
  return String(Math.floor(Math.random() * 1000)).padStart(3, '0');
}

// GET /:slug/menu/:table_slug
async function showTableMenu(req, res) {
  const table = await RestaurantTable.findOne({
    where: { table_slug: req.params.table_slug },
    include: [{ model: User, as: 'restaurant', where: { slug: req.params.slug, status: 'approved' } }],
  });

  if (!table) {
    return res.status(404).send('Not found');
  }
  const restaurant = table.restaurant;
  req.session.customerContext = {
    restaurantId: restaurant.id,
    branchId: table.branch_id,
    tableId: table.id,
  };

  const isBillRequested = table.status === 'bill_requested';
  const isBilling = table.status === 'billing';
  let isOwner = false;
  let showStartOverPrompt = false;
  let canStartOver = false;

  const payFirst = restaurant.pay_first || false;
  const isOccupiedByAnyone = table.owner_session_id !== null;
  const isVerifiedByCookie = req.session.is_verified === true && table.table_token === req.cookies.verified_token;

  if (payFirst && isOccupiedByAnyone && !isVerifiedByCookie && table.owner_session_id !== req.sessionID) {
    showStartOverPrompt = true;
    const hasActiveOrders = await TableCustomer.count({
      where: {
        table_id: table.id,
        status: { [Op.in]: ['order_food', 'order_drink', 'preparing', 'pending_approval', 'confirmed'] },
      },
    });
    canStartOver = hasActiveOrders === 0;
  }

  const myExistingCartRow = await TableCustomer.findOne({
    where: { table_id: table.id, session_id: req.sessionID },
  });
  if (!myExistingCartRow) {
    req.session.cart = [];
  }

  let isOccupied = ['occupied', 'preparing', 'ordered', 'served', 'billing', 'confirmed', 'pending_approval'].includes(
    table.status
  );

  if (!isOccupied && !isBillRequested) {
    const token = randomToken();
    table.status = 'occupied';
    table.table_token = token;
    table.owner_session_id = req.sessionID;
    await table.save();
    isOccupied = true;
    req.session.is_verified = true;
    res.cookie('verified_token', token, { maxAge: 120 * 60 * 1000 });
    isOwner = true;
  } else if (table.owner_session_id === req.sessionID) {
    isOwner = true;
  }

  let isVerified = false;
  if (isOwner) {
    isVerified = true;
  } else if (isOccupied && table.table_token === req.cookies.verified_token) {
    isVerified = true;
  }
  if (showStartOverPrompt) {
    isVerified = false;
  }
  req.session.is_verified = isVerified;

  const allMenus = await Item.findAll({
    where: { user_id: restaurant.id, ...(table.branch_id ? { branch_id: table.branch_id } : {}) },
    include: [
      { model: ItemVariant, as: 'variants' },
      { model: Topping, as: 'toppings' },
    ],
    order: [['item_order', 'ASC']],
  });

  // NOTE: this active-discount computation goes slightly beyond strict
  // parity with the original. Item::getActiveDiscount()/getDiscountedPrice()
  // exist in the Laravel model but a grep of resources/views and every
  // controller shows they're never actually called anywhere - discounts
  // could be created via SuperAdmin/DiscountController but never displayed
  // to a customer. Same situation as round 4's Pusher broadcast: rather
  // than faithfully port "the admin can create a discount that does
  // nothing," this wires the display through, since a discount feature
  // that doesn't discount anything felt like a bug worth fixing.
  for (const item of allMenus) {
    const activeDiscount = await item.getActiveDiscount();
    item.active_discount = activeDiscount;
    item.discounted_price = activeDiscount ? item.getDiscountedPrice(activeDiscount) : null;
  }

  req.session.restaurant_id = restaurant.id;
  req.session.restaurant_name = restaurant.name;
  req.session.restaurant_address = restaurant.address;
  req.session.table_id = table.id;
  req.session.table_name = table.table_name;

  const categories = await Category.findAll({
    where: { user_id: restaurant.id, ...(table.branch_id ? { branch_id: table.branch_id } : {}) },
    order: [['category_order', 'ASC']],
  });

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
  if (!menuTemplate) {
    menuTemplate = { template_id: 1, show_product_image: false, show_category_image: false };
  }

  // Fetch active promotions / special offers for this restaurant
  const promotionsList = await Promotion.findAll({
    where: {
      restaurant_id: restaurant.id,
      is_active: { [Op.in]: ['Active', 'active'] },
    },
    include: [
      {
        association: 'items',
        include: [{ association: 'item' }],
      },
    ],
    order: [['id', 'DESC']],
  });

  const dayNames = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const todayName = dayNames[new Date().getDay()];
  const todayStr = new Date().toISOString().slice(0, 10);
  const nowClock = new Date().toTimeString().slice(0, 8);

  const activePromotions = promotionsList.filter((p) => {
    if (p.start_date && p.start_date > todayStr) return false;
    if (p.end_date && p.end_date < todayStr) return false;
    if (p.start_time && p.start_time !== 'All Time' && p.start_time > nowClock) return false;
    if (p.end_time && p.end_time !== 'All Time' && p.end_time < nowClock) return false;
    if (Array.isArray(p.days) && p.days.length && !p.days.includes('All Day') && !p.days.includes(todayName)) return false;
    return true;
  });

  res.render('menu/table', {
    table,
    restaurant,
    allMenus,
    usersub,
    categories,
    promotions: activePromotions,
    isOccupied,
    menuTemplate,
    isSubscribed,
    isBillRequested,
    isBilling,
    isOwner,
    showStartOverPrompt,
    canStartOver,
  });
}

// POST /add-table-menu
async function addTableMenu(req, res) {
  const tableId = req.body.table_id;
  const table = await RestaurantTable.findByPk(tableId, { include: [{ model: User, as: 'restaurant' }] });
  if (!table) return res.status(404).json({ success: false, error: 'Table not found' });
  if (String(req.session.table_id) !== String(table.id) || req.session.customerContext?.restaurantId !== table.restaurant_id) {
    return res.status(403).json({ success: false, error: 'Scan this table QR code before ordering.' });
  }
  if (table.status === 'bill_requested' || table.status === 'billing') {
    return res.status(403).json({ success: false, error: 'bill_requested' });
  }

  const itemsToAdd = req.body.items || [];
  if (!itemsToAdd.length) {
    return res.status(400).json({ success: false, error: 'No items provided' });
  }

  for (const itemData of itemsToAdd) {
    const { item_id: itemId, variant_id: variantId, quantity, comment = '', toppings = [] } = itemData;
    const item = await Item.findOne({
      where: {
        id: itemId,
        user_id: table.restaurant_id,
        ...(table.branch_id ? { branch_id: table.branch_id } : {}),
      },
    });
    if (!item) return res.status(403).json({ success: false, error: 'This item is not available at the scanned restaurant.' });
    if (item.sold_out) return res.status(409).json({ success: false, error: `${item.item_name} is sold out.` });

    let price = parseFloat(item.price);
    if (variantId) {
      const variant = await ItemVariant.findByPk(variantId);
      if (!variant || variant.item_id !== item.id) continue;
      price = parseFloat(variant.price);
    } else {
      // Discounts only apply to the item's own base price, same as the
      // original's getDiscountedPrice($item->price) - variants aren't
      // discounted (there's no per-variant discount concept in either app).
      const activeDiscount = await item.getActiveDiscount();
      if (activeDiscount) {
        price = item.getDiscountedPrice(activeDiscount);
      } else {
        const promoItem = await PromotionItem.findOne({
          where: { item_id: item.id },
          include: [
            {
              model: Promotion,
              as: 'promotion',
              where: {
                restaurant_id: table.restaurant_id,
                is_active: { [Op.in]: ['Active', 'active'] },
              },
            },
          ],
        });
        if (promoItem && promoItem.offer_price) {
          const promoPrice = parseFloat(promoItem.offer_price);
          if (!isNaN(promoPrice) && promoPrice < price) {
            price = promoPrice;
          }
        }
      }
    }

    const toppingDetails = [];
    if (toppings.length) {
      const selectedToppings = await Topping.findAll({ where: { id: { [Op.in]: toppings } } });
      for (const topping of selectedToppings) {
        price += parseFloat(topping.price);
        toppingDetails.push({ id: topping.id, name: topping.name, price: topping.price });
      }
    }

    if (quantity > 0) {
      await TableCustomer.create({
        table_id: tableId,
        item_id: itemId,
        item_variant_id: variantId || null,
        quantity,
        price,
        status: 'add_to_cart',
        remarks: String(comment).trim(),
        toppings: toppingDetails.length ? toppingDetails : null,
        session_id: req.sessionID,
      });
    }
  }

  return res.json({ success: 'Items added to cart successfully.' });
}

// GET /get-tablecart
async function getTableCart(req, res) {
  const which = req.query.show;
  const cartMap = {};
  const tableId = req.session.table_id;
  const table = await RestaurantTable.findByPk(tableId, { include: [{ model: User, as: 'restaurant' }] });
  const payFirst = table?.restaurant?.pay_first || false;

  const myOrder = await TableCustomer.findAll({
    where: { table_id: tableId, session_id: req.sessionID },
    include: [{ model: Item, as: 'item' }],
  });

  const unconfirmedItemCount = myOrder
    .filter((o) => o.status === 'add_to_cart')
    .reduce((sum, o) => sum + o.quantity, 0);
  const confirmedItemCount = myOrder
    .filter((o) => !['add_to_cart', 'cancelled'].includes(o.status))
    .reduce((sum, o) => sum + o.quantity, 0);

  const hasConfirmedItems = (await TableCustomer.count({ where: { table_id: tableId, status: 'confirmed' } })) > 0;
  const isOwner = table && table.owner_session_id === req.sessionID;
  const showConfirmAndPay = payFirst && isOwner && hasConfirmedItems && table.status !== 'billing';

  for (const orderItem of myOrder) {
    if (!orderItem.item) continue;

    const variant = orderItem.item_variant_id ? await ItemVariant.findByPk(orderItem.item_variant_id) : null;
    const itemName = orderItem.item.item_name + (variant ? ` (${variant.name})` : '');

    const toppings = orderItem.toppings || [];
    const toppingNames = toppings.length ? '+ ' + toppings.map((t) => t.name).join(', ') : '';
    const toppingIds = toppings.length ? toppings.map((t) => t.id).join('-') : '';
    const compositeKey = `${orderItem.item_id}-${orderItem.item_variant_id}-t${toppingIds}-${orderItem.status}`;

    if (!cartMap[compositeKey]) {
      cartMap[compositeKey] = {
        item_id: orderItem.item_id,
        variant_id: orderItem.item_variant_id,
        name: itemName,
        price: orderItem.price,
        quantity: 0,
        item_total: 0,
        remarks: '',
        tableId: orderItem.table_id,
        status: orderItem.status,
        toppings: toppingNames,
        topping_ids: toppingIds,
      };
    }

    cartMap[compositeKey].quantity += orderItem.quantity;
    cartMap[compositeKey].item_total += parseFloat(orderItem.price) * orderItem.quantity;
    if (orderItem.remarks) {
      cartMap[compositeKey].remarks += orderItem.remarks + '; ';
    }
  }

  const restaurantName = req.session.restaurant_name;
  const restaurantAddress = req.session.restaurant_address;
  const tableName = req.session.table_name;

  const tableCustomers = await TableCustomer.findAll({
    where: { table_id: tableId, status: { [Op.notIn]: ['add_to_cart', 'bill_requested', 'cancelled'] } },
  });
  const allOrdersCount = tableCustomers.reduce((sum, o) => sum + o.quantity, 0);

  const cart = Object.values(cartMap);
  const subtotal = cart.reduce((sum, c) => sum + c.item_total, 0);
  const total = subtotal;

  res.render(
    'menu/table-menu-cart',
    { which, cart, restaurantName, restaurantAddress, tableName, tableId, tableCustomers, subtotal, total, showConfirmAndPay, payFirst, layout: false },
    (err, html) => {
      if (err) throw err;
      res.json({
        html,
        cart: JSON.stringify(cartMap),
        restaurantName,
        subtotal,
        total,
        restaurantAddress,
        unconfirmed_item_count: unconfirmedItemCount,
        confirmed_item_count: confirmedItemCount,
        all_orders_count: allOrdersCount,
        showConfirmAndPay,
      });
    }
  );
}

// POST /tablecart/store
async function storeOrder(req, res) {
  const tableId = req.body.table_id;
  const sessionId = req.sessionID;

  const table = await RestaurantTable.findByPk(tableId, { include: [{ model: User, as: 'restaurant' }] });
  if (!table || !table.restaurant) {
    return res.status(404).json({ success: false, message: 'Table not found.' });
  }
  const restaurant = table.restaurant;

  const unconfirmedItems = await TableCustomer.findAll({
    where: { table_id: tableId, status: 'add_to_cart', session_id: sessionId },
  });

  if (!unconfirmedItems.length) {
    return res.json({ success: false, message: 'No items to confirm.' });
  }

  for (const customerItem of unconfirmedItems) {
    customerItem.status = 'confirmed';
    customerItem.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    await customerItem.save();
  }

  if (!restaurant.pay_first) {
    await sendToKitchen(tableId);
    newOrderPlaced(restaurant.id);
  }

  req.session.cart = undefined;
  return res.json({ success: true, pay_first: restaurant.pay_first });
}

// GET /table-order/delete/:id
async function deleteTableOrderItem(req, res) {
  const id = req.params.id;
  const parts = id.split('-t');
  const itemVariantPart = parts[0];
  const toppingPart = parts[1] || '';

  const [itemId, variantId] = itemVariantPart.split('-');
  const toppingIds = toppingPart ? toppingPart.split('-').sort() : [];

  const where = { session_id: req.sessionID, item_id: itemId, status: 'add_to_cart' };
  if (variantId && variantId !== 'null') {
    where.item_variant_id = variantId;
  } else {
    where.item_variant_id = null;
  }

  const rows = await TableCustomer.findAll({ where });
  const toDelete = rows.filter((row) => {
    const rowToppingIds = (row.toppings || []).map((t) => String(t.id)).sort();
    if (!toppingIds.length) return rowToppingIds.length === 0;
    return toppingIds.every((tid) => rowToppingIds.includes(String(tid)));
  });

  await Promise.all(toDelete.map((row) => row.destroy()));

  return res.json({ success: true, message: 'Unconfirmed item removed successfully.' });
}

// POST /verify-table-token
async function verifyTableToken(req, res) {
  const token = req.body.table_token;
  const table = await RestaurantTable.findOne({ where: { table_token: token } });
  if (table) {
    req.session.is_verified = true;
    res.cookie('verified_token', token, { maxAge: 120 * 60 * 1000 });
    return res.redirect(req.get('referer') || '/');
  }
  return res.redirect('back' in req ? req.get('referer') : '/');
}

// POST /table-menu/confirm-and-pay/:id
async function confirmAndPay(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id, { include: [{ model: User, as: 'restaurant' }] });
  if (!table || !table.restaurant.pay_first) {
    return res.status(400).json({ success: false, message: 'Invalid request.' });
  }
  if (table.owner_session_id !== req.sessionID) {
    return res.status(403).json({ success: false, message: 'Only the main user can initiate payment.' });
  }
  table.status = 'billing';
  await table.save();
  newOrderPlaced(table.restaurant_id);
  return res.json({ success: true });
}

// GET /table-status/:id
async function getTableStatus(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id);
  if (!table) return res.status(404).json({ status: 'not_found' });

  const lockKey = `payment_lock_table_${req.params.id}`;
  const isLocked = cache.has(lockKey);
  let orderId = null;

  if (table.status === 'ordered') {
    const fiveMinAgo = new Date(Date.now() - 5 * 60 * 1000);
    const order = await Order.findOne({
      where: { table_id: req.params.id, created_at: { [Op.gt]: fiveMinAgo } },
      order: [['created_at', 'DESC']],
    });
    if (order) orderId = order.id;
  }

  return res.json({ status: table.status, is_locked: isLocked, order_id: orderId });
}

// GET /make_my_bill/:id
async function makeBill(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id, { include: [{ model: User, as: 'restaurant' }] });
  if (!table) return res.status(404).send('Table not found.');
  const restaurant = table.restaurant;

  let orders = [];
  const include = [
    { model: Item, as: 'item' },
    { model: ItemVariant, as: 'variant' },
  ];

  if (restaurant.pay_first) {
    orders = await TableCustomer.findAll({
      where: { table_id: table.id, status: { [Op.in]: ['confirmed', 'billing'] } },
      include,
    });
  } else if (table.status === 'bill_requested') {
    orders = await TableCustomer.findAll({ where: { table_id: table.id, status: 'payment_pending' }, include });
  } else {
    const allActiveOrders = await TableCustomer.findAll({
      where: { table_id: table.id, status: { [Op.notIn]: ['add_to_cart', 'cancelled'] } },
    });
    if (!allActiveOrders.length) {
      return res.render('res/bill-preparing', { message: 'There are no billable items for this table yet.' });
    }
    const allDelivered = allActiveOrders.every((o) => o.status === 'order_delivered');
    if (!allDelivered) {
      return res.render('res/bill-preparing', {
        message: 'Please wait until all items are served before requesting the bill.',
      });
    }
    orders = await TableCustomer.findAll({ where: { table_id: table.id, status: 'order_delivered' }, include });
  }

  if (!orders.length) {
    return res.render('res/bill-preparing', { message: 'No items available for billing.' });
  }

  if (restaurant.pay_first && table.status === 'billing') {
    await TableCustomer.update({ status: 'billing' }, { where: { table_id: table.id, status: 'confirmed' } });
  }

  return res.render('res/make-bill-table', { orders, restaurant, table });
}

// POST /request-bill/:id
async function requestBill(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id, { include: [{ model: User, as: 'restaurant' }] });
  if (!table) return res.status(404).json({ success: false, error: 'Table not found.' });
  const restaurant = table.restaurant;

  const lockKey = `payment_lock_table_${req.params.id}`;
  if (cache.has(lockKey)) {
    return res.status(409).json({ success: false, error: 'Another payment is already in progress.' });
  }
  cache.put(lockKey, true, 60);

  const isAjax = req.xhr || req.get('X-Requested-With') === 'XMLHttpRequest';

  if (restaurant.pay_first) {
    const ordersToBill = await TableCustomer.findAll({
      where: { table_id: table.id, status: 'billing' },
      include: [{ model: ItemVariant, as: 'variant' }],
    });

    if (ordersToBill.length) {
      const grandTotal = ordersToBill.reduce((sum, o) => sum + parseFloat(o.price) * o.quantity, 0);

      const userOrder = await Order.create({
        res_id: table.restaurant_id,
        name: table.table_name,
        qr_type: 'Table Based QR',
        table_id: table.id,
        total_cost: grandTotal,
        order_status: 'pending_approval',
        payment_mode: 'cod',
      });

      for (const order of ordersToBill) {
        await OrderItem.create({
          order_id: userOrder.id,
          item_id: order.item_id,
          item_variant_id: order.item_variant_id,
          variant_name: order.variant ? order.variant.name : null,
          price: order.price,
          qty: order.quantity,
          total: parseFloat(order.price) * order.quantity,
          toppings: order.toppings,
          remarks: order.remarks,
        });
      }
    }

    await TableCustomer.update(
      { status: 'pending_approval', payment_mode: 'cod' },
      { where: { table_id: table.id, status: 'billing' } }
    );

    table.status = 'pending_approval';
    await table.save();
    newOrderPlaced(restaurant.id);

    if (isAjax) {
      return res.json({
        success: true,
        message: 'Order sent to counter for approval. Please complete your payment there.',
        restaurant_name: restaurant.name,
        table_name: table.table_name,
      });
    }
    return res.redirect(`/bill-requested/${table.id}`);
  }

  const ordersToBill = await TableCustomer.findAll({ where: { table_id: table.id, status: 'order_delivered' } });
  if (!ordersToBill.length) {
    cache.forget(lockKey);
    return res.status(400).json({ success: false, error: 'No items to process for billing.' });
  }
  const grandTotal = ordersToBill.reduce((sum, o) => sum + parseFloat(o.price) * o.quantity, 0);
  const userOrder = await Order.create({
    res_id: table.restaurant_id,
    name: table.table_name,
    qr_type: 'Table Based QR',
    table_id: table.id,
    total_cost: grandTotal,
    order_status: 'pending_payment',
    payment_mode: 'cod',
  });

  for (const order of ordersToBill) {
    const variant = order.item_variant_id ? await ItemVariant.findByPk(order.item_variant_id) : null;
    await OrderItem.create({
      order_id: userOrder.id,
      item_id: order.item_id,
      item_variant_id: order.item_variant_id,
      variant_name: variant ? variant.name : null,
      price: order.price,
      qty: order.quantity,
      total: parseFloat(order.price) * order.quantity,
      toppings: order.toppings,
      remarks: order.remarks,
    });
    order.status = 'payment_pending';
    await order.save();
  }

  table.status = 'bill_requested';
  await table.save();
  newOrderPlaced(restaurant.id);

  if (isAjax) {
    return res.json({
      success: true,
      message: 'Your bill has been requested successfully. Please proceed to the counter to complete your payment.',
      restaurant_name: restaurant.name,
      table_name: table.table_name,
    });
  }
  return res.redirect(`/bill-requested/${table.id}`);
}

// GET /bill-requested/:id
async function showBillRequestedPage(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id, { include: [{ model: User, as: 'restaurant' }] });
  if (!table) return res.status(404).send('Not found');
  const restaurant = table.restaurant;
  const statusToQuery = restaurant.pay_first ? 'payment_pending' : 'order_delivered';

  const orderDetails = await TableCustomer.findAll({
    where: { table_id: table.id, status: statusToQuery },
    include: [
      { model: Item, as: 'item' },
      { model: ItemVariant, as: 'variant' },
    ],
  });

  return res.render('menu/thankyou', { restaurant, table, orderDetails });
}

// POST /table-menu/create-payment-intent
// NOTE: requires the `stripe` npm package (`npm install stripe`) - not
// added to package.json by default since Stripe keys need to be rotated
// first (see README). Uncomment the require + logic below once ready.
async function createTablePaymentIntent(req, res) {
  const tableId = req.body.table_id;
  const table = await RestaurantTable.findByPk(tableId, { include: [{ model: User, as: 'restaurant' }] });
  if (!table) return res.status(422).json({ error: 'table_id is invalid.' });
  const restaurant = table.restaurant;

  if (!restaurant || !restaurant.card_payment || !restaurant.secret_key) {
    return res.status(400).json({ error: 'Card payment is not configured for this restaurant.' });
  }

  const lockKey = `payment_lock_table_${table.id}`;
  if (cache.has(lockKey)) {
    return res.status(429).json({ error: 'A payment is already being processed for this table.' });
  }
  cache.put(lockKey, true, 60);

  const statusToBill = restaurant.pay_first ? 'billing' : 'order_delivered';
  const ordersToBill = await TableCustomer.findAll({ where: { table_id: tableId, status: statusToBill } });
  if (!ordersToBill.length) {
    cache.forget(lockKey);
    return res.status(400).json({ error: 'No items to bill.' });
  }

  const total = ordersToBill.reduce((sum, o) => sum + parseFloat(o.price) * o.quantity, 0);
  if (total <= 0) {
    cache.forget(lockKey);
    return res.status(400).json({ error: 'Total amount must be greater than zero.' });
  }

  try {
    // eslint-disable-next-line global-require
    const stripe = require('stripe')(restaurant.secret_key);
    const paymentIntent = await stripe.paymentIntents.create({
      amount: Math.round(total * 100),
      currency: 'usd',
      metadata: { restaurant_id: restaurant.id, table_id: table.id, table_name: table.table_name },
    });
    return res.json({ clientSecret: paymentIntent.client_secret });
  } catch (e) {
    cache.forget(lockKey);
    // eslint-disable-next-line no-console
    console.error('Stripe Payment Intent creation failed:', e.message);
    return res.status(500).json({ error: 'Could not initiate payment. Please try again later.' });
  }
}

// POST /table-menu/complete-paid-order
async function completePaidOrder(req, res) {
  const { table_id: tableId, transaction_id: transactionId } = req.body;
  if (!tableId || !transactionId) {
    return res.status(422).json({ error: 'table_id and transaction_id are required.' });
  }

  const t = await sequelize.transaction();
  try {
    const table = await RestaurantTable.findByPk(tableId, { include: [{ model: User, as: 'restaurant' }], transaction: t });
    if (!table) throw new Error('Table not found.');
    const restaurant = table.restaurant;
    const statusToBill = restaurant.pay_first ? 'billing' : 'order_delivered';

    const ordersToProcess = await TableCustomer.findAll({
      where: { table_id: tableId, status: statusToBill },
      include: [
        { model: Item, as: 'item' },
        { model: ItemVariant, as: 'variant' },
      ],
      transaction: t,
    });
    if (!ordersToProcess.length) throw new Error('No items to bill found.');

    const grandTotal = ordersToProcess.reduce((sum, o) => sum + parseFloat(o.price) * o.quantity, 0);

    const userOrder = await Order.create(
      {
        res_id: table.restaurant_id,
        name: table.table_name,
        qr_type: 'Table Based QR',
        table_id: table.id,
        total_cost: grandTotal,
        order_status: 'pending_approval',
        payment_mode: 'card',
        transaction_id: transactionId,
      },
      { transaction: t }
    );

    for (const order of ordersToProcess) {
      await OrderItem.create(
        {
          order_id: userOrder.id,
          item_id: order.item_id,
          item_variant_id: order.item_variant_id,
          variant_name: order.variant ? order.variant.name : null,
          price: order.price,
          qty: order.quantity,
          total: parseFloat(order.price) * order.quantity,
          toppings: order.toppings,
          remarks: order.remarks,
        },
        { transaction: t }
      );

      if (restaurant.pay_first) {
        order.status = 'pending_approval';
        order.payment_mode = 'card';
        await order.save({ transaction: t });
      } else {
        await order.destroy({ transaction: t });
      }
    }

    if (restaurant.pay_first) {
      table.status = 'pending_approval';
      newOrderPlaced(restaurant.id);
    } else {
      const remaining = await TableCustomer.count({
        where: { table_id: tableId, status: { [Op.ne]: 'cancelled' } },
        transaction: t,
      });
      if (remaining === 0) {
        await TableCustomer.destroy({ where: { table_id: tableId, status: 'cancelled' }, transaction: t });
        table.status = 'available';
        table.table_token = null;
      }
    }
    await table.save({ transaction: t });

    await t.commit();
    cache.forget(`payment_lock_table_${tableId}`);

    return res.json({ success: 'Order completed and paid successfully.', order_id: userOrder.id });
  } catch (e) {
    await t.rollback();
    cache.forget(`payment_lock_table_${tableId}`);
    // eslint-disable-next-line no-console
    console.error('Paid order completion failed:', e.message);
    return res.status(500).json({ error: 'An internal error occurred while completing the order.' });
  }
}

// POST /table-menu/start-over/:id
async function startOver(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id);
  if (!table) return res.status(404).send('Table not found.');

  const hasActiveOrders = await TableCustomer.count({
    where: { table_id: table.id, status: { [Op.notIn]: ['order_delivered', 'cancelled', 'add_to_cart'] } },
  });
  if (hasActiveOrders > 0) {
    return res.status(409).send('Cannot start a new order while there are active items. Please wait or contact staff.');
  }

  await TableCustomer.destroy({ where: { table_id: table.id } });
  await Order.destroy({ where: { table_id: table.id, order_status: { [Op.ne]: 'completed' } } });

  table.status = 'occupied';
  table.owner_session_id = req.sessionID;
  table.table_token = randomToken();
  await table.save();

  req.session.is_verified = true;
  res.cookie('verified_token', table.table_token, { maxAge: 120 * 60 * 1000 });

  return res.redirect(req.get('referer') || '/');
}

// Ports the private sendToKitchen() helper.
async function sendToKitchen(tableId) {
  const items = await TableCustomer.findAll({
    where: { table_id: tableId, status: 'confirmed' },
    include: [{ model: Item, as: 'item' }],
  });
  for (const item of items) {
    item.status = item.item.is_drink ? 'order_drink' : 'order_food';
    await item.save();
  }
}

module.exports = {
  showTableMenu,
  addTableMenu,
  getTableCart,
  storeOrder,
  deleteTableOrderItem,
  verifyTableToken,
  confirmAndPay,
  getTableStatus,
  makeBill,
  requestBill,
  showBillRequestedPage,
  createTablePaymentIntent,
  completePaidOrder,
  startOver,
};
