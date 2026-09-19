const { Op } = require('sequelize');
const { Order, Subscription, UserSubscription } = require('../models');
const { resolveDateRange } = require('../utils/reportDateFilter');

// Ported from app/Http/Controllers/SuperAdmin/OrderSummaryController.php -
// a restaurant-owner-facing dashboard of order counts/sales split by
// qr_type (online vs table-based). The original has a large commented-out
// alternate implementation gated on subscription plan name; only the
// active code path (unconditional totals regardless of plan) is ported,
// matching what actually runs.

// GET /order-summary
async function index(req, res) {
  const restaurantId = req.currentUser.id;

  const activeSub = await UserSubscription.findOne({
    where: { user_id: restaurantId, payment_status: 'paid', subscription_status: 'active' },
    order: [['id', 'DESC']],
  });
  let subscriptionName = null;
  if (activeSub) {
    const subscription = await Subscription.findByPk(activeSub.subscription_id);
    if (subscription) subscriptionName = subscription.name;
  }

  const datePeriod = req.query.date_period || '';
  const dateRange = req.query.selected_date || '';
  const where = { res_id: restaurantId };
  const range = resolveDateRange(datePeriod, dateRange);
  if (range) where.created_at = { [Op.between]: [range.start, range.end] };

  const totalCount = await Order.count({ where });
  const totalSales = (await Order.sum('total_cost', { where })) || 0;

  const onlineWhere = { ...where, qr_type: { [Op.in]: ['Order Online QR', 'singleqr'] } };
  const singleqrCount = await Order.count({ where: onlineWhere });
  const totalSingleqrSales = (await Order.sum('total_cost', { where: onlineWhere })) || 0;

  const tableWhere = { ...where, qr_type: { [Op.in]: ['Table Based QR', 'tableqr'] } };
  const tableqrCount = await Order.count({ where: tableWhere });
  const totalTableqrSales = (await Order.sum('total_cost', { where: tableWhere })) || 0;

  return res.render('res/order-summary', {
    totalCount,
    subscriptionName,
    singleqrCount,
    tableqrCount,
    totalSales,
    totalSingleqrSales,
    totalTableqrSales,
    dateRange,
    datePeriod,
  });
}

module.exports = { index };
