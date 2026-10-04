const { Op } = require('sequelize');
const { User, Subscription, UserSubscription, Order } = require('../models');

function applyDateFilter(where, datePeriod, dateRange) {
  if (!dateRange) return where;
  try {
    switch (datePeriod) {
      case 'daily': {
        const start = new Date(`${dateRange}T00:00:00`);
        const end = new Date(`${dateRange}T23:59:59.999`);
        where.created_at = { [Op.between]: [start, end] };
        break;
      }
      case 'monthly': {
        const [month, year] = dateRange.split('-');
        if (month && year) {
          const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`);
          const end = new Date(start);
          end.setMonth(end.getMonth() + 1);
          where.created_at = { [Op.gte]: start, [Op.lt]: end };
        }
        break;
      }
      case 'yearly': {
        const start = new Date(`${dateRange}-01-01T00:00:00`);
        const end = new Date(`${dateRange}-12-31T23:59:59.999`);
        where.created_at = { [Op.between]: [start, end] };
        break;
      }
      case 'custom': {
        const [startDate, endDate] = dateRange.split('|');
        if (startDate && endDate) {
          where.created_at = { [Op.between]: [new Date(`${startDate}T00:00:00`), new Date(`${endDate}T23:59:59.999`)] };
        }
        break;
      }
      default:
        break;
    }
  } catch (e) {
    console.warn('Date filter error, skipping filter:', e.message);
  }
  return where;
}

// GET /superadmin/dashboard
async function index(req, res) {
  const datePeriod = req.query.date_period || '';
  const dateRange = req.query.selected_date || '';

  let totalRestaurants = 0;
  let approvedRestaurants = 0;
  let pendingRestaurants = 0;
  let totalSubscribed = 0;
  let platformSales = 0;
  let platformOrders = 0;
  let estimatedMrr = 0;
  let subscriptions = [];
  let subscriptionCountsMap = {};
  let recentRestaurants = [];

  // 1. Safe Restaurants query
  try {
    const restaurantWhere = applyDateFilter({ user_type: 'R', del_status: 0 }, datePeriod, dateRange);
    totalRestaurants = await User.count({ where: restaurantWhere });
    approvedRestaurants = await User.count({ where: { ...restaurantWhere, status: 'approved' } });
    pendingRestaurants = await User.count({ where: { ...restaurantWhere, status: 'pending' } });
  } catch (err) {
    console.warn('Restaurants query error:', err.message);
    try {
      totalRestaurants = await User.count({ where: { user_type: 'R' } });
    } catch (e) {}
  }

  // 2. Safe Subscriptions query
  try {
    subscriptions = await Subscription.findAll({ where: { del_status: 0 } });
  } catch (err) {
    console.warn('Subscriptions query error:', err.message);
    subscriptions = [];
  }

  // 3. Safe UserSubscriptions query
  try {
    const subWhere = applyDateFilter({}, datePeriod, dateRange);
    totalSubscribed = await UserSubscription.count({
      where: { ...subWhere, subscription_status: 'active' },
    });

    const activeUserSubs = await UserSubscription.findAll({
      where: { ...subWhere, subscription_status: 'active' },
      attributes: ['subscription_id'],
      raw: true,
    });

    activeUserSubs.forEach((s) => {
      if (s.subscription_id) {
        subscriptionCountsMap[s.subscription_id] = (subscriptionCountsMap[s.subscription_id] || 0) + 1;
      }
    });
  } catch (err) {
    console.warn('UserSubscription query error:', err.message);
  }

  // 4. Safe MRR Calculation
  subscriptions.forEach((sub) => {
    const userCount = subscriptionCountsMap[sub.id] || 0;
    const cost = parseFloat(sub.cost) || 0;
    const months = parseInt(sub.month, 10) || 1;
    estimatedMrr += (userCount * (cost / months));
  });

  // 5. Safe Order & Revenue query
  try {
    const orderWhere = applyDateFilter({ order_status: 'completed' }, datePeriod, dateRange);
    platformOrders = await Order.count({ where: orderWhere });
    const allCompletedOrders = await Order.findAll({
      where: orderWhere,
      attributes: ['total_cost'],
      raw: true,
    });
    allCompletedOrders.forEach((o) => {
      platformSales += parseFloat(o.total_cost || 0);
    });
  } catch (err) {
    console.warn('Order query error:', err.message);
  }

  // 6. Safe Recent Restaurants feed
  try {
    recentRestaurants = await User.findAll({
      where: { user_type: 'R', del_status: 0 },
      order: [['created_at', 'DESC']],
      limit: 6,
    });
  } catch (err) {
    console.warn('Recent restaurants query error:', err.message);
  }

  return res.render('superadmin/dashboard', {
    title: 'Platform Overview',
    subscriptions,
    totalRestaurants,
    approvedRestaurants,
    pendingRestaurants,
    totalSubscribed,
    subscriptionCountsMap,
    platformSales,
    platformOrders,
    estimatedMrr,
    recentRestaurants,
    dateRange,
    datePeriod,
  });
}

module.exports = { index };