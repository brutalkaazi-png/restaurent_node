const { Op } = require('sequelize');
const { sequelize, TableCustomer, TableCustomersPreorder, Item } = require('../models');
const { notifyRestaurant } = require('../utils/events');

/* ------------------------------------------------------------------ *
 * Ported from app/Http/Controllers/KitchenController.php and
 * BarController.php. Those two files are ~95% identical, differing only
 * in `is_drink` (false for kitchen / true for bar), the status names used
 * ('order_food' vs 'order_drink'), and the view/table name - so instead of
 * duplicating ~300 lines twice, this factory builds either controller from
 * one implementation, the same way you'd extract a shared base class in
 * PHP. `createStationController('kitchen')` / `createStationController('bar')`
 * produce the exact route-handler shape both controllers had.
 * ------------------------------------------------------------------ */

function restaurantIdFor(user) {
  return user.user_type === 'R' ? user.id : user.waiter_id;
}

function createStationController(station) {
  const isDrink = station === 'bar';
  const orderedStatus = isDrink ? 'order_drink' : 'order_food';
  const noOrdersMessage = `No active orders in the ${station}.`;

  async function getStationOrders(restaurantId, branchId) {
    const standardOrders = await TableCustomer.findAll({
      where: { status: { [Op.in]: [orderedStatus, 'preparing', 'cancelled_pending'] } },
      include: [
        { model: Item, as: 'item', where: { is_drink: isDrink }, include: [{ association: 'category' }] },
        { association: 'variant' },
        { association: 'table', where: { restaurant_id: restaurantId, branch_id: branchId } },
      ],
      order: [['created_at', 'ASC']],
    });

    const preOrders = await TableCustomersPreorder.findAll({
      where: { status: { [Op.in]: ['approved', 'preparing', 'cancelled_pending'] } },
      include: [
        { model: Item, as: 'item', where: { is_drink: isDrink }, include: [{ association: 'category' }] },
        { association: 'variant' },
        { association: 'table', where: { restaurant_id: restaurantId, branch_id: branchId } },
      ],
      order: [['created_at', 'ASC']],
    });

    // Normalize preorders for the shared view: 'approved' status displays
    // the same as the just-ordered state, and there's no `time` column on
    // preorders so we derive one from created_at.
    const normalizedPreOrders = preOrders.map((po) => {
      const plain = po.get({ plain: true });
      plain.status = plain.status === 'approved' ? orderedStatus : plain.status;
      plain.time = new Date(plain.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
      plain._model = 'preorder';
      return plain;
    });

    const merged = standardOrders
      .map((o) => ({ ...o.get({ plain: true }), _model: 'standard' }))
      .concat(normalizedPreOrders);

    merged.sort((a, b) => new Date(a.created_at) - new Date(b.created_at));
    return merged;
  }

  function groupItemSummary(orders) {
    const byItem = {};
    orders.forEach((order) => {
      if (!byItem[order.item_id]) {
        byItem[order.item_id] = {
          item_id: order.item.id,
          item_name: order.item.item_name,
          total_quantity: 0,
          category_id: order.item.category ? order.item.category.id : null,
          category_name: order.item.category ? order.item.category.category_name : 'Uncategorized',
          sources: [],
        };
      }
      const bucket = byItem[order.item_id];
      bucket.total_quantity += order.quantity;
      bucket.sources.push({
        id: order.id,
        table_name: order.table ? order.table.table_name : null,
        variant: order.variant,
        toppings: order.toppings,
        remarks: order.remarks,
        quantity: order.quantity,
        time: order.time,
        status: order.status,
        is_drink: order.item.is_drink,
      });
    });

    const groupedByCategory = {};
    Object.values(byItem)
      .sort((a, b) => a.category_name.localeCompare(b.category_name))
      .forEach((item) => {
        if (!groupedByCategory[item.category_name]) groupedByCategory[item.category_name] = [];
        groupedByCategory[item.category_name].push(item);
      });
    return groupedByCategory;
  }

  async function getFinishedOrders(restaurantId, branchId, date, page = 1, perPage = 10) {
    const where = { status: { [Op.in]: ['order_delivered', 'cancelled'] } };
    if (date) {
      where.updated_at = { [Op.gte]: new Date(`${date}T00:00:00`), [Op.lt]: new Date(`${date}T23:59:59.999`) };
    }
    const { count, rows } = await TableCustomer.findAndCountAll({
      where,
      include: [
        { model: Item, as: 'item', where: { is_drink: isDrink } },
        { association: 'table', where: { restaurant_id: restaurantId, branch_id: branchId } },
      ],
      order: [
        ['updated_at', 'DESC'],
        ['id', 'DESC'],
      ],
      limit: perPage,
      offset: (page - 1) * perPage,
    });
    return { count, rows, page, perPage, totalPages: Math.ceil(count / perPage) };
  }

  // GET /kitchen-admin/kitchen  or  /kitchen-admin/bar
  async function index(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const orders = await getStationOrders(restaurantId, req.branchId);
    const groupedByCategory = groupItemSummary(orders);
    const today = new Date().toISOString().slice(0, 10);
    const finished = await getFinishedOrders(restaurantId, req.branchId, today);

    res.render('station/index', {
      station,
      restaurantId,
      activeOrders: orders,
      groupedByCategory,
      finishedOrdersToday: finished,
    });
  }

  // GET /update-order/:id?action=preparing
  async function updateOrder(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const action = req.query.action || 'preparing';
    const allowed = ['preparing', 'order_delivered', 'cancelled', 'order_food', 'order_drink', 'cancelled_pending', 'approved'];
    if (!allowed.includes(action)) {
      return res.status(400).json({ success: false, message: 'Invalid status.' });
    }

    let row = await TableCustomer.findOne({
      where: { id: req.params.id },
      include: [{ association: 'table', where: { restaurant_id: restaurantId, branch_id: req.branchId } }],
    });
    let isPreorder = false;

    if (!row) {
      row = await TableCustomersPreorder.findOne({
        where: { id: req.params.id },
        include: [{ association: 'table', where: { restaurant_id: restaurantId, branch_id: req.branchId } }],
      });
      isPreorder = true;
    }

    if (!row) {
      return res.status(404).json({ success: false, message: 'Order item not found.' });
    }

    row.status = action;
    if (!isPreorder) {
      row.time = new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' });
    }
    await row.save();

    notifyRestaurant(restaurantId, { reason: 'status-change', station });

    // Cleanup: once every item for a pay-first preorder ticket (same
    // table+token) is delivered/cancelled, the ticket is fully done - clear it.
    if (station === 'kitchen' && isPreorder && action === 'order_delivered') {
      const hasPending = await TableCustomersPreorder.count({
        where: {
          table_id: row.table_id,
          token: row.token,
          status: { [Op.notIn]: ['order_delivered', 'cancelled'] },
        },
      });
      if (!hasPending) {
        await TableCustomersPreorder.destroy({ where: { table_id: row.table_id, token: row.token } });
      }
    }

    return res.json({ success: true, message: 'Order updated successfully.' });
  }

  // POST .../toggle-sold-out/:id
  async function toggleItemSoldOut(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const item = await Item.findOne({ where: { id: req.params.id, user_id: restaurantId } });
    if (!item) return res.status(404).json({ success: false, message: 'Item not found.' });

    item.sold_out = !item.sold_out;
    await item.save();
    notifyRestaurant(restaurantId, { reason: 'menu-update', station });

    return res.json({ success: true, sold_out: item.sold_out });
  }

  // GET .../fetch-time-wise | fetch-table-wise | fetch-item-wise
  async function fetchTimeWiseView(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const orders = await getStationOrders(restaurantId, req.branchId);
    const byTable = {};
    orders.forEach((o) => {
      const key = o.table ? o.table.table_name : 'Unknown';
      byTable[key] = byTable[key] || [];
      byTable[key].push(o);
    });
    res.render('partials/kitchen-time-wise', { byTable, noOrdersMessage, layout: false }, wrapJsonHtml(res));
  }

  async function fetchTableWiseView(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const orders = await getStationOrders(restaurantId, req.branchId);
    res.render('partials/kitchen-table-wise', { orders, noOrdersMessage, layout: false }, wrapJsonHtml(res));
  }

  async function fetchItemWiseView(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const orders = await getStationOrders(restaurantId, req.branchId);
    const groupedByCategory = groupItemSummary(orders);
    res.render('partials/kitchen-item-wise', { groupedByCategory, noOrdersMessage, layout: false }, wrapJsonHtml(res));
  }

  // POST .../update-items-status  { status, item_ids[] | category_id }
  async function updateItemsStatus(req, res) {
    const { status, item_ids: itemIds, category_id: categoryId } = req.body;
    if (![orderedStatus, 'preparing'].includes(status)) {
      return res.status(422).json({ success: false, message: 'Invalid status.' });
    }
    const restaurantId = restaurantIdFor(req.currentUser);

    const fromStatusStandard = status === 'preparing' ? orderedStatus : 'preparing';
    const fromStatusPreorder = status === 'preparing' ? 'approved' : 'preparing';

    const tableIds = (
      await sequelize.models.RestaurantTable.findAll({ where: { restaurant_id: restaurantId, branch_id: req.branchId }, attributes: ['id'] })
    ).map((t) => t.id);

    let itemIdFilter = itemIds;
    if (categoryId) {
      itemIdFilter = (await Item.findAll({ where: { item_category: categoryId, user_id: restaurantId, branch_id: req.branchId }, attributes: ['id'] })).map(
        (i) => i.id
      );
    } else if (!itemIds || !itemIds.length) {
      return res.status(400).json({ success: false, message: 'No items or category specified.' });
    }

    const [updatedStandard] = await TableCustomer.update(
      { status, time: new Date().toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit' }) },
      { where: { status: fromStatusStandard, table_id: { [Op.in]: tableIds }, item_id: { [Op.in]: itemIdFilter } } }
    );
    const [updatedPreorder] = await TableCustomersPreorder.update(
      { status },
      { where: { status: fromStatusPreorder, table_id: { [Op.in]: tableIds }, item_id: { [Op.in]: itemIdFilter } } }
    );

    notifyRestaurant(restaurantId, { reason: 'status-change', station });

    return res.json({
      success: true,
      message: `${updatedStandard + updatedPreorder} items updated to ${status}.`,
    });
  }


  // GET .../history-by-date?date=YYYY-MM-DD&page=N
  async function fetchHistoryByDate(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const page = parseInt(req.query.page, 10) || 1;
    const result = await getFinishedOrders(restaurantId, req.branchId, req.query.date, page);
    res.render('partials/kitchen-history', { result, layout: false }, wrapJsonHtml(res, 'links'));
  }

  // GET .../order-counts
  async function getOrderCounts(req, res) {
    const restaurantId = restaurantIdFor(req.currentUser);
    const tableIds = (
      await sequelize.models.RestaurantTable.findAll({ where: { restaurant_id: restaurantId, branch_id: req.branchId }, attributes: ['id'] })
    ).map((t) => t.id);

    const count = async (Model, isDrinkFlag, statuses) =>
      Model.count({
        where: { table_id: { [Op.in]: tableIds }, status: { [Op.in]: statuses } },
        include: [{ model: Item, as: 'item', where: { is_drink: isDrinkFlag }, required: true }],
      });

    const kitchen =
      (await count(TableCustomer, false, ['order_food', 'preparing', 'cancelled_pending'])) +
      (await count(TableCustomersPreorder, false, ['approved', 'preparing', 'cancelled_pending']));
    const bar =
      (await count(TableCustomer, true, ['order_drink', 'preparing', 'cancelled_pending'])) +
      (await count(TableCustomersPreorder, true, ['approved', 'preparing', 'cancelled_pending']));

    return res.json({ kitchen, bar });
  }

  return {
    index,
    updateOrder,
    toggleItemSoldOut,
    fetchTimeWiseView,
    fetchTableWiseView,
    fetchItemWiseView,
    updateItemsStatus,
    fetchHistoryByDate,
    getOrderCounts,
  };
}

// Small helper so the fetch*View handlers above can render an EJS partial
// and return it as `{ html: ... }` JSON, the way the Laravel controllers
// render a Blade partial and wrap it in response()->json(['html' => ...]).
function wrapJsonHtml(res, extraKey) {
  return (err, html) => {
    if (err) throw err;
    const payload = { html };
    if (extraKey) payload[extraKey] = '';
    res.json(payload);
  };
}

module.exports = { createStationController, restaurantIdFor };
