const { Op, fn, col } = require('sequelize');
const { OrderItem, Order, Item, Category } = require('../models');
const { resolveDateRange } = require('../utils/reportDateFilter');
const { getSettings } = require('../utils/settingHelper');

/* ------------------------------------------------------------------ *
 * Ported from app/Http/Controllers/SuperAdmin/OrderReportController.php
 * AND TableOrderReportController.php - identical except for the qr_type
 * filter ('Order Online QR' vs 'Table Based QR') and the view path, same
 * factory pattern used for Kitchen/Bar in stationController.js.
 * ------------------------------------------------------------------ */

function createOrderReportController(qrType, viewPrefix) {
  // GET .../{route}  (item-by-item sales summary for this restaurant, filtered by status/date)
  async function index(req, res) {
    const restaurantId = req.currentUser.id;
    const status = req.query.status || '';
    const dateRange = req.query.selected_date || '';
    const datePeriod = req.query.date_period || '';

    // Matches the original's session()->put(...) - the view() action below
    // falls back to these when it's reached without explicit query params
    // (e.g. navigated to from a link that doesn't repeat the filter).
    req.session.date_range = dateRange;
    req.session.date_period = datePeriod;

    const orderWhere = { res_id: restaurantId, qr_type: qrType };
    if (status) orderWhere.order_status = status;

    const range = resolveDateRange(datePeriod, dateRange);
    const orderItemWhere = {};
    if (range) {
      // The original filters daily/monthly/yearly on order_items.created_at
      // but 'custom' on orders.created_at - preserved here even though
      // that inconsistency looks unintentional, since changing it would be
      // changing behavior rather than porting it.
      if (datePeriod === 'custom') {
        orderWhere.created_at = { [Op.between]: [range.start, range.end] };
      } else {
        orderItemWhere.created_at = { [Op.between]: [range.start, range.end] };
      }
    }

    const rows = await OrderItem.findAll({
      where: orderItemWhere,
      include: [
        { model: Item, as: 'item', required: true, include: [{ model: Category, as: 'category', required: true }] },
        { model: Order, as: 'order', required: true, where: orderWhere },
      ],
      attributes: [
        [col('item.category.category_name'), 'category_name'],
        [col('item.item_name'), 'item_name'],
        [col('item.id'), 'item_id'],
        [fn('SUM', col('OrderItem.qty')), 'sum_qty'],
        [fn('SUM', col('OrderItem.total')), 'total_sum'],
      ],
      group: ['item.category.category_name', 'item.id', 'item.item_name'],
      order: [[col('item.category.category_name'), 'ASC']],
      raw: true,
    });

    const groupedOrderItems = {};
    rows.forEach((row) => {
      groupedOrderItems[row.category_name] = groupedOrderItems[row.category_name] || [];
      groupedOrderItems[row.category_name].push(row);
    });

    const setting = await getSettings();
    return res.render(`${viewPrefix}/index`, { orderItems: rows, dateRange, datePeriod, groupedOrderItems, setting, status });
  }

  // GET .../view/:id  (every individual order line for one item)
  async function view(req, res) {
    const dateRange = req.query.selected_date || req.session.date_range || '';
    const datePeriod = req.query.date_period || req.session.date_period || '';
    const page = parseInt(req.query.page, 10) || 1;
    const perPage = 10;

    const item = await Item.findByPk(req.params.id);
    const setting = await getSettings();

    const orderWhere = { qr_type: qrType };
    // Only daily/monthly/yearly are supported here, matching the original
    // (its view() switch has no 'custom' case, unlike index()).
    const range = ['daily', 'monthly', 'yearly'].includes(datePeriod) ? resolveDateRange(datePeriod, dateRange) : null;
    if (range) orderWhere.created_at = { [Op.between]: [range.start, range.end] };

    const { count, rows } = await OrderItem.findAndCountAll({
      where: { item_id: req.params.id },
      include: [{ model: Order, as: 'order', required: true, where: orderWhere }],
      order: [['id', 'DESC']],
      limit: perPage,
      offset: (page - 1) * perPage,
    });

    return res.render(`${viewPrefix}/view`, {
      itemDetails: rows,
      item,
      setting,
      dateRange,
      datePeriod,
      page,
      totalPages: Math.ceil(count / perPage),
    });
  }

  return { index, view };
}

module.exports = { createOrderReportController };
