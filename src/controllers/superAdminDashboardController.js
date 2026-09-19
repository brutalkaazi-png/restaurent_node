const { Op } = require('sequelize');
const { sequelize, User, Subscription, UserSubscription } = require('../models');

// Ported from app/Http/Controllers/SuperAdmin/DashboardController.php.
// Builds the same date_period/selected_date filter (daily/monthly/yearly/
// custom) the original applies to three separate queries.
function applyDateFilter(where, datePeriod, dateRange) {
  if (!dateRange) return where;
  switch (datePeriod) {
    case 'daily': {
      const start = new Date(`${dateRange}T00:00:00`);
      const end = new Date(`${dateRange}T23:59:59.999`);
      where.created_at = { [Op.between]: [start, end] };
      break;
    }
    case 'monthly': {
      const [month, year] = dateRange.split('-');
      const start = new Date(`${year}-${String(month).padStart(2, '0')}-01T00:00:00`);
      const end = new Date(start);
      end.setMonth(end.getMonth() + 1);
      where.created_at = { [Op.gte]: start, [Op.lt]: end };
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
      where.created_at = { [Op.between]: [new Date(startDate), new Date(endDate)] };
      break;
    }
    default:
      break;
  }
  return where;
}

// GET /superadmin/dashboard
async function index(req, res) {
  const datePeriod = req.query.date_period || '';
  const dateRange = req.query.selected_date || '';

  const restaurantWhere = applyDateFilter({ user_type: 'R', status: 'approved' }, datePeriod, dateRange);
  const totalRestaurantRegistered = await User.count({ where: restaurantWhere });

  const subscriptionWhere = applyDateFilter({}, datePeriod, dateRange);
  const totalRestaurantSubscribed = await UserSubscription.count({ where: subscriptionWhere });

  const subscriptionCount = await UserSubscription.findAll({
    attributes: ['subscription_id', [sequelize.fn('COUNT', sequelize.col('id')), 'user_count']],
    where: subscriptionWhere,
    group: ['subscription_id'],
  });

  const subscriptions = await Subscription.findAll({ where: { del_status: 0 } });

  return res.render('superadmin/dashboard', {
    subscriptions,
    totalRestaurantRegistered,
    totalRestaurantSubscribed,
    subscriptionCount,
    dateRange,
    datePeriod,
  });
}

module.exports = { index };
