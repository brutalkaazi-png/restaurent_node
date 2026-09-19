const { Op } = require('sequelize');
const {
  sequelize,
  User,
  Item,
  RestaurantTable,
  TableCustomer,
  TableCustomersPreorder,
  Order,
  OrderItem,
} = require('../models');
const cache = require('../utils/cacheStore');
const { newOrderPlaced, notifyRestaurant } = require('../utils/events');
const { getSettings } = require('../utils/settingHelper');

// Ported from app/Http/Controllers/CounterController.php

// GET /counter-admin/:slug/counter
async function index(req, res) {
  const restaurant = await User.findOne({ where: { slug: req.params.slug, id: req.tenantId } });
  if (!restaurant) return res.status(404).send('Not found');

  const tables = await RestaurantTable.findAll({ where: { restaurant_id: restaurant.id, branch_id: req.branchId, is_virtual: false } });
  return res.render('res/counter', { restaurant, tables });
}

// GET /counter-admin/get_table_updates/:id  (restaurant id)
async function getTableUpdates(req, res) {
  const restaurantId = req.params.id;
  if (String(restaurantId) !== String(req.tenantId)) return res.status(403).json({ error: 'Forbidden' });

  const activeTables = await RestaurantTable.findAll({
    where: { restaurant_id: restaurantId, branch_id: req.branchId, status: { [Op.notIn]: ['available', 'bill_paid'] } },
  });
  const activeTableIds = activeTables.map((t) => t.id);

  const orderTimeRows = activeTableIds.length
    ? await TableCustomer.findAll({
        where: { table_id: { [Op.in]: activeTableIds }, status: { [Op.ne]: 'add_to_cart' } },
        attributes: ['table_id', [sequelize.fn('MAX', sequelize.col('updated_at')), 'start_time']],
        group: ['table_id'],
      })
    : [];
  const orderTimes = {};
  orderTimeRows.forEach((r) => {
    orderTimes[r.table_id] = r.get('start_time');
  });

  if (activeTableIds.length) {
    const itemStatusRows = await TableCustomer.findAll({
      where: { table_id: { [Op.in]: activeTableIds }, status: { [Op.ne]: 'add_to_cart' } },
      attributes: ['table_id', 'status'],
    });
    const itemStatusesByTable = {};
    itemStatusRows.forEach((r) => {
      itemStatusesByTable[r.table_id] = itemStatusesByTable[r.table_id] || [];
      itemStatusesByTable[r.table_id].push(r.status);
    });

    for (const tableId of activeTableIds) {
      const items = itemStatusesByTable[tableId] || [];
      const currentTable = await RestaurantTable.findOne({ where: { id: tableId, restaurant_id: restaurantId, branch_id: req.branchId }, include: [{ model: User, as: 'restaurant' }] });
      if (!currentTable) continue;

      if (['bill_requested', 'bill_paid', 'pending_approval'].includes(currentTable.status)) continue;

      if (!items.length) {
        if (['ordered', 'preparing', 'served'].includes(currentTable.status)) {
          currentTable.status = 'occupied';
          await currentTable.save();
        }
        continue;
      }

      const payFirstEnabled = currentTable.restaurant?.pay_first || false;
      const autoClearEnabled = currentTable.restaurant?.counter_auto_clear || false;

      const hasPreparing = items.includes('preparing');
      const hasOrderedFood = items.includes('order_food');
      const hasOrderedDrink = items.includes('order_drink');
      const hasOrdered = hasOrderedFood || hasOrderedDrink;
      const hasDelivered = items.includes('order_delivered');
      const allCancelled = items.every((s) => s === 'cancelled');

      let newStatus = currentTable.status;

      if (allCancelled) {
        newStatus = 'occupied';
      } else if (hasPreparing) {
        newStatus = 'preparing';
      } else if (hasOrdered) {
        newStatus = 'ordered';
      } else if (hasDelivered) {
        if (payFirstEnabled && autoClearEnabled) {
          await TableCustomer.destroy({ where: { table_id: tableId } });
          currentTable.status = 'available';
          currentTable.table_token = null;
          currentTable.owner_session_id = null;
          await currentTable.save();
          continue;
        }
        newStatus = 'served';
      }

      if (newStatus !== currentTable.status) {
        currentTable.status = newStatus;
        await currentTable.save();
      }
    }
  }

  const tables = await RestaurantTable.findAll({ where: { restaurant_id: restaurantId, branch_id: req.branchId } });
  const tablesJson = [];
  for (const table of tables) {
    const plain = table.get({ plain: true });
    plain.start_time = !['available', 'bill_paid'].includes(table.status) ? orderTimes[table.id] || table.updated_at : null;

    if (table.is_virtual) {
      const order = await Order.findOne({ where: { table_id: table.id }, order: [['created_at', 'DESC']] });
      if (order) {
        plain.customer_info = {
          name: order.name,
          phone: order.phone,
          email: order.email,
          address: order.address,
          delivery_type: order.delivery_type,
          payment_mode: order.payment_mode,
          total_cost: order.total_cost,
          transaction_id: order.transaction_id,
        };
      }
    }
    tablesJson.push(plain);
  }

  return res.json({ tables: tablesJson });
}

// GET /counter-admin/get_table_orders/:id
async function getTableOrders(req, res) {
  const orders = await TableCustomer.findAll({
    where: { table_id: req.params.id, status: { [Op.ne]: 'add_to_cart' } },
    include: [{ association: 'item' }, { association: 'variant' }, { association: 'table', where: { restaurant_id: req.tenantId, branch_id: req.branchId }, required: true }],
    order: [['created_at', 'DESC']],
  });

  // Group identical line items (same item+variant+status+toppings+remarks)
  // the same way the Laravel controller's groupBy composite key does.
  const groups = {};
  orders.forEach((o) => {
    const toppings = (o.toppings || []).slice().sort((a, b) => a.id - b.id);
    const toppingIds = toppings.map((t) => t.id).join('-');
    const key = `${o.item_id}-${o.item_variant_id}-${o.status}-${toppingIds}-${(o.remarks || '').trim().toLowerCase()}`;
    if (!groups[key]) {
      groups[key] = {
        item: o.item,
        is_drink: o.item ? o.item.is_drink : false,
        variant: o.variant,
        toppings,
        quantity: 0,
        price: o.price,
        status: o.status,
        remarks: o.remarks,
        created_at: o.created_at,
        sub_order_ids: [],
      };
    }
    groups[key].quantity += o.quantity;
    groups[key].sub_order_ids.push(o.id);
  });
  const groupedOrders = Object.values(groups).map((g) => ({ ...g, sub_order_ids: g.sub_order_ids.join(',') }));

  res.render('res/counter-order-details', { groupedOrders, id: req.params.id, layout: false }, (err, html) => {
    if (err) throw err;
    res.send(html);
  });
}

// POST /counter-admin/update-order  { id: "1,2,3", status }
async function updateOrder(req, res) {
  const ids = String(req.body.id).split(',');
  const status = req.body.status;
  const allowed = ['preparing', 'order_delivered', 'cancelled', 'order_food', 'order_drink'];
  if (!allowed.includes(status)) {
    return res.status(400).json({ success: false, message: 'Invalid status.' });
  }
  const scopedRows = await TableCustomer.findAll({
    where: { id: { [Op.in]: ids } },
    include: [{ association: 'table', where: { restaurant_id: req.tenantId, branch_id: req.branchId }, required: true }],
  });
  if (!scopedRows.length) return res.status(404).json({ success: false, message: 'Order items not found.' });
  const scopedIds = scopedRows.map((row) => row.id);
  await TableCustomer.update(
    { status, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
    { where: { id: { [Op.in]: scopedIds } } }
  );

  const firstRow = scopedRows[0];
  if (firstRow && firstRow.table) notifyRestaurant(firstRow.table.restaurant_id, { reason: 'status-change' });

  return res.json({ success: true, message: 'Status updated successfully.' });
}

// GET /counter-admin/make_bill/:id
async function makeBill(req, res) {
  const table = await RestaurantTable.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId }, include: [{ model: User, as: 'restaurant' }] });
  if (!table) return res.status(404).json({ error: 'Table not found.' });
  const restaurant = table.restaurant;
  let orders = [];

  if (restaurant.pay_first) {
    orders = await TableCustomer.findAll({
      where: { table_id: req.params.id, status: { [Op.in]: ['confirmed', 'billing'] } },
      include: [{ association: 'item' }, { association: 'variant' }],
      order: [['created_at', 'DESC']],
    });
  } else if (table.status === 'bill_requested') {
    orders = await TableCustomer.findAll({
      where: { table_id: req.params.id, status: 'payment_pending' },
      include: [{ association: 'item' }, { association: 'variant' }],
    });
  } else {
    const allActive = await TableCustomer.findAll({
      where: { table_id: req.params.id, status: { [Op.notIn]: ['add_to_cart', 'cancelled', 'bill_paid'] } },
    });
    if (!allActive.length) {
      return res.render('res/bill-preparing', { message: 'There are no items to bill for this table yet.' });
    }
    const allDelivered = allActive.every((o) => o.status === 'order_delivered');
    if (!allDelivered) {
      return res.render('res/bill-preparing', {
        message: 'Please wait until all items are served before preparing the bill.',
      });
    }
    orders = await TableCustomer.findAll({
      where: { table_id: req.params.id, status: 'order_delivered' },
      include: [{ association: 'item' }, { association: 'variant' }],
    });
  }

  if (!orders.length) {
    return res.render('res/bill-preparing', { message: 'There are no items ready for billing on this table yet.' });
  }

  return res.render('res/make-bill', { orders, restaurant, table });
}

// POST /counter-admin/complete_order/:id
async function completeOrder(req, res) {
  const tableId = req.params.id;
  const table = await RestaurantTable.findOne({ where: { id: tableId, restaurant_id: req.tenantId, branch_id: req.branchId }, include: [{ model: User, as: 'restaurant' }] });
  if (!table || !table.restaurant) {
    return res.status(500).json({ error: 'Table or restaurant data not found.' });
  }

  if (table.restaurant.pay_first) {
    table.status = 'pending_approval';
    await table.save();
    await TableCustomer.update(
      { status: 'pending_approval', payment_mode: 'cod' },
      { where: { table_id: tableId, status: 'billing' } }
    );
    newOrderPlaced(table.restaurant_id);
    return res.json({ success: 'Order sent for approval.' });
  }
  const discountPercent = parseFloat(req.body.discount_percent || 0);
  const taxPercent = parseFloat(req.body.tax_percent || 0);
  const itemIds = req.body.item_ids || [];
  let printHtml = null;

  if (!itemIds.length) {
    return res.status(400).json({ error: 'No items selected for billing.' });
  }

  const ordersToBill = await TableCustomer.findAll({
    where: { id: { [Op.in]: itemIds } },
    include: [{ association: 'table', where: { restaurant_id: req.tenantId, branch_id: req.branchId }, required: true },
      { association: 'item' }, { association: 'variant' }],
  });

  const subtotal = ordersToBill.reduce((sum, o) => sum + parseFloat(o.price) * o.quantity, 0);
  const discountAmount = (subtotal * discountPercent) / 100;
  const totalAfterDiscount = subtotal - discountAmount;
  const taxAmount = (totalAfterDiscount * taxPercent) / 100;
  const grandTotal = totalAfterDiscount + taxAmount;

  if (req.body.print) {
    try {
      const settings = await getSettings();
      printHtml = await renderToString('res/printable-bill', {
        restaurant: table.restaurant,
        table_name: table.table_name,
        items: ordersToBill,
        subtotal,
        discount_percent: discountPercent,
        tax_percent: taxPercent,
        grand_total: grandTotal,
        setting: settings,
      });
    } catch (e) {
      // eslint-disable-next-line no-console
      console.error('Bill printing failed:', e.message);
      return res.status(500).json({ error: 'Failed to generate bill for printing.' });
    }
  }

  if (table.is_virtual) {
    const match = /Online #(\d+)/.exec(table.table_name);
    if (match) {
      const originalOrder = await Order.findOne({ where: { id: match[1], res_id: table.restaurant_id, branch_id: req.branchId } });
      if (originalOrder) {
        await originalOrder.update({ discount: discountAmount, total_cost: grandTotal, order_status: 'completed' });
      }
    }
    await TableCustomer.destroy({ where: { id: { [Op.in]: itemIds } } });
    const remaining = await TableCustomer.count({ where: { table_id: tableId } });
    if (remaining === 0) {
      await table.destroy();
    }
  } else {
    const pendingOrder = await Order.findOne({ where: { table_id: table.id, res_id: table.restaurant_id, branch_id: req.branchId, order_status: 'pending_payment' } });
    if (pendingOrder) {
      await OrderItem.destroy({ where: { order_id: pendingOrder.id } });
      await pendingOrder.destroy();
    }

    const userOrder = await Order.create({
      res_id: table.restaurant_id,
      branch_id: req.branchId,
      name: table.table_name,
      qr_type: 'Table Based QR',
      table_id: table.id,
      discount: discountAmount,
      total_cost: grandTotal,
      order_status: 'completed',
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

    await TableCustomer.destroy({ where: { id: { [Op.in]: itemIds } } });
    const remaining = await TableCustomer.count({ where: { table_id: tableId, status: { [Op.ne]: 'cancelled' } } });
    if (remaining === 0) {
      await TableCustomer.destroy({ where: { table_id: tableId } });
      await table.update({ status: 'available', table_token: null, owner_session_id: null });
    } else {
      await table.update({ status: 'served' });
    }
  }

  notifyRestaurant(table.restaurant_id, { reason: 'order-completed' });
  return res.json({ success: 'Order completed successfully.', print_html: printHtml });
}

// POST /counter-admin/approve-table-order/:tableId  - approves a pay-first order
async function approveTableOrder(req, res) {
  const t = await sequelize.transaction();
  try {
    const table = await RestaurantTable.findOne({
      where: { id: req.params.tableId, restaurant_id: req.tenantId, branch_id: req.branchId },
      include: [{ model: User, as: 'restaurant' }],
      transaction: t,
    });
    if (!table) throw Object.assign(new Error('Table not found.'), { status: 404 });

    if (table.status !== 'pending_approval') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'This order is not pending approval.' });
    }

    let printHtml = null;

    if (table.restaurant.pay_first) {
      const activeOrders = await TableCustomer.findAll({ where: { table_id: table.id }, transaction: t });

      if (req.body.print === 'true') {
        const subtotal = activeOrders.reduce((sum, o) => sum + parseFloat(o.price) * o.quantity, 0);
        const settings = await getSettings();
        printHtml = await renderToString('res/printable-bill', {
          restaurant: table.restaurant,
          table_name: table.table_name,
          items: activeOrders,
          subtotal,
          discount_percent: 0,
          tax_percent: 0,
          grand_total: subtotal,
          setting: settings,
        });
      }

      for (const order of activeOrders) {
        await TableCustomersPreorder.create(
          {
            table_id: order.table_id,
            item_id: order.item_id,
            item_variant_id: order.item_variant_id,
            quantity: order.quantity,
            price: order.price,
            status: 'approved',
            token: table.table_token,
            remarks: order.remarks,
            toppings: order.toppings,
          },
          { transaction: t }
        );
      }

      const financialOrder = await Order.findOne({
        where: { table_id: req.params.tableId, res_id: req.tenantId, branch_id: req.branchId, order_status: 'pending_approval' },
        order: [['created_at', 'DESC']],
        transaction: t,
      });
      if (financialOrder) {
        financialOrder.order_status = 'approved';
        await financialOrder.save({ transaction: t });
      }

      await TableCustomer.destroy({ where: { table_id: req.params.tableId }, transaction: t });

      table.status = 'available';
      table.table_token = null;
      table.owner_session_id = null;
      await table.save({ transaction: t });

      cache.forget(`payment_lock_table_${req.params.tableId}`);
      newOrderPlaced(table.restaurant_id);

      await t.commit();
      return res.json({ success: true, message: 'Order approved, paid, and table cleared.', print_html: printHtml });
    }

    const itemsToProcess = await TableCustomer.findAll({
      where: { table_id: req.params.tableId, status: 'pending_approval' },
      include: [{ association: 'item' }],
      transaction: t,
    });
    for (const item of itemsToProcess) {
      item.status = item.item.is_drink ? 'order_drink' : 'order_food';
      await item.save({ transaction: t });
    }

    table.status = 'ordered';
    await table.save({ transaction: t });
    newOrderPlaced(table.restaurant_id);

    await t.commit();
    return res.json({ success: true, message: 'Order approved and sent to kitchen/bar.' });
  } catch (e) {
    await t.rollback();
    // eslint-disable-next-line no-console
    console.error(e);
    return res.status(e.status || 500).json({ success: false, message: e.message || 'An internal error occurred.' });
  }
}

// GET /counter-admin/cancel_order/:id
async function cancelOrder(req, res) {
  const table = await RestaurantTable.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (table) {
    if (table.is_virtual) {
      const match = /Online #(\d+)/.exec(table.table_name);
      if (match) {
        const originalOrder = await Order.findOne({ where: { id: match[1], res_id: table.restaurant_id, branch_id: req.branchId } });
        if (originalOrder) await originalOrder.update({ order_status: 'cancelled' });
      }
      await TableCustomer.destroy({ where: { table_id: table.id } });
      await table.destroy();
    } else {
      const pendingOrder = await Order.findOne({
        where: { table_id: table.id, order_status: 'pending_approval' },
        order: [['created_at', 'DESC']],
      });
      if (pendingOrder) {
        await OrderItem.destroy({ where: { order_id: pendingOrder.id } });
        await pendingOrder.destroy();
      }
      await TableCustomer.destroy({ where: { table_id: table.id } });
      await table.update({ status: 'available', table_token: null, owner_session_id: null });
    }
    notifyRestaurant(table.restaurant_id, { reason: 'order-cancelled' });
  }
  return res.json({ success: true });
}

// GET /counter-admin/get-online-orders/:id  (restaurant id)
async function getOnlineOrders(req, res) {
  if (String(req.params.id) !== String(req.tenantId)) return res.status(403).json({ error: 'Forbidden' });
  const orders = await Order.findAll({
    where: { res_id: req.params.id, branch_id: req.branchId, order_status: 'requested' },
    include: [{ model: OrderItem, as: 'order_items', include: [{ association: 'item' }, { association: 'variant' }] }],
    order: [['created_at', 'ASC']],
  });

  res.render('res/online-orders-pending', { orders, layout: false }, (err, html) => {
    if (err) throw err;
    res.json({ html, count: orders.length });
  });
}

// POST /counter-admin/approve-order/:orderId  - approves a delivery/pickup order into a virtual table
async function approveOrder(req, res) {
  const t = await sequelize.transaction();
  try {
    const order = await Order.findOne({
      where: { id: req.params.orderId, res_id: req.tenantId, branch_id: req.branchId },
      include: [{ model: OrderItem, as: 'order_items' }],
      transaction: t,
    });
    if (!order) throw new Error('Order not found.');
    if (order.order_status !== 'requested') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'Order has already been processed.' });
    }

    const virtualTable = await RestaurantTable.create(
      {
        restaurant_id: order.res_id,
        branch_id: req.branchId,
        table_name: `Online #${order.id}`,
        table_slug: `online-${order.id}-${Date.now()}`,
        status: 'ordered',
        is_virtual: true,
      },
      { transaction: t }
    );

    for (const item of order.order_items) {
      const foodItem = await Item.findOne({ where: { id: item.item_id, user_id: req.tenantId, branch_id: req.branchId }, transaction: t });
      if (!foodItem) continue;
      await TableCustomer.create(
        {
          table_id: virtualTable.id,
          item_id: item.item_id,
          item_variant_id: item.item_variant_id,
          quantity: item.qty,
          price: item.price,
          remarks: item.remarks,
          status: foodItem.is_drink ? 'order_drink' : 'order_food',
          time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }),
          toppings: item.toppings,
          session_id: `online_order_${order.id}`,
        },
        { transaction: t }
      );
    }

    await order.update({ table_id: virtualTable.id, order_status: 'approved' }, { transaction: t });
    newOrderPlaced(order.res_id);

    await t.commit();
    return res.json({ success: true, message: 'Order approved and sent to kitchen.' });
  } catch (e) {
    await t.rollback();
    // eslint-disable-next-line no-console
    console.error('Failed to approve order:', e.message);
    return res.status(500).json({ success: false, message: 'An internal error occurred.' });
  }
}

// POST /counter-admin/decline-order/:orderId
async function declineOrder(req, res) {
  const order = await Order.findOne({ where: { id: req.params.orderId, res_id: req.tenantId, branch_id: req.branchId } });
  if (!order) return res.status(404).json({ success: false, message: 'Order not found.' });
  await order.update({ order_status: 'cancelled' });
  notifyRestaurant(order.res_id, { reason: 'order-declined' });
  return res.json({ success: true, message: 'Order has been declined.' });
}

// POST /counter-admin/update-counter-settings  { auto_clear }
async function updateCounterSettings(req, res) {
  const restaurant = req.currentUser.user_type === 'R' ? req.currentUser : await req.currentUser.getRestaurant?.();
  if (!restaurant) return res.status(404).json({ success: false, message: 'Restaurant not found.' });
  restaurant.counter_auto_clear = !!req.body.auto_clear;
  await restaurant.save();
  return res.json({ success: true, message: 'Settings updated successfully.' });
}

// POST /counter-admin/undo-bill-request/:id
async function undoBillRequest(req, res) {
  const t = await sequelize.transaction();
  try {
    const table = await RestaurantTable.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId }, transaction: t });
    if (!table) throw new Error('Table not found.');
    if (table.status !== 'bill_requested') {
      await t.rollback();
      return res.status(409).json({ success: false, message: 'This table has not requested a bill.' });
    }

    await TableCustomer.update(
      { status: 'order_delivered' },
      { where: { table_id: req.params.id, status: 'payment_pending' }, transaction: t }
    );

    const order = await Order.findOne({
      where: { table_id: req.params.id, res_id: req.tenantId, branch_id: req.branchId, order_status: 'pending_payment' },
      order: [['created_at', 'DESC']],
      transaction: t,
    });
    if (order) {
      await OrderItem.destroy({ where: { order_id: order.id }, transaction: t });
      await order.destroy({ transaction: t });
    }

    table.status = 'served';
    await table.save({ transaction: t });
    cache.forget(`payment_lock_table_${req.params.id}`);
    newOrderPlaced(table.restaurant_id);

    await t.commit();
    return res.json({ success: true, message: 'Bill request has been undone.' });
  } catch (e) {
    await t.rollback();
    // eslint-disable-next-line no-console
    console.error('Failed to undo bill request:', e.message);
    return res.status(500).json({ success: false, message: 'An internal error occurred.' });
  }
}

// Renders an EJS view to a string without going through res.render (needed
// for the printable-bill HTML that gets embedded inside a JSON response
// rather than sent as the response body itself).
function renderToString(view, data) {
  const path = require('path');
  const ejs = require('ejs');
  return ejs.renderFile(path.join(__dirname, '..', 'views', `${view}.ejs`), data);
}

module.exports = {
  index,
  getTableUpdates,
  getTableOrders,
  updateOrder,
  makeBill,
  completeOrder,
  approveTableOrder,
  cancelOrder,
  getOnlineOrders,
  approveOrder,
  declineOrder,
  updateCounterSettings,
  undoBillRequest,
};
