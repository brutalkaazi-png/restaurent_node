const { Op } = require('sequelize');
const { Order, RestaurantTable, Item, TableCustomer, StaffCall } = require('../models');

// GET /dashboard
async function index(req, res) {
  try {
    const user = req.currentUser;
    if (!user) {
      return res.redirect('/login');
    }

    const restaurantId = user.id;

    // 1. Fetch completed orders for revenue
    let completedOrders = [];
    try {
      completedOrders = await Order.findAll({
        where: { res_id: restaurantId, order_status: 'completed' },
        attributes: ['total_cost', 'qr_type'],
        raw: true,
      });
    } catch (e) {
      console.warn('Dashboard: completedOrders query fallback:', e.message);
    }

    // 2. Fetch recent 6 orders for activity feed
    let recentOrders = [];
    try {
      recentOrders = await Order.findAll({
        where: { res_id: restaurantId },
        order: [['created_at', 'DESC']],
        limit: 6,
      });
    } catch (e) {
      console.warn('Dashboard: recentOrders query fallback:', e.message);
    }

    // 3. Count floor tables
    let activeTablesCount = 0;
    let totalTablesCount = 0;
    try {
      totalTablesCount = await RestaurantTable.count({
        where: { restaurant_id: restaurantId, is_virtual: false },
      });
      activeTablesCount = await RestaurantTable.count({
        where: {
          restaurant_id: restaurantId,
          is_virtual: false,
          status: { [Op.notIn]: ['available', 'bill_paid'] },
        },
      });
    } catch (e) {
      console.warn('Dashboard: tables query fallback:', e.message);
    }

    // 4. Menu & Sold-out counts
    let menuCount = 0;
    let soldOutCount = 0;
    try {
      menuCount = await Item.count({ where: { user_id: restaurantId } });
      soldOutCount = await Item.count({ where: { user_id: restaurantId, sold_out: true } });
    } catch (e) {
      console.warn('Dashboard: menu query fallback:', e.message);
    }

    // 5. Kitchen queue count (safe query without complex joins)
    let kitchenQueue = 0;
    let barQueue = 0;
    try {
      const activeRows = await TableCustomer.findAll({
        where: {
          status: { [Op.in]: ['order_food', 'order_drink', 'preparing', 'confirmed'] },
        },
        attributes: ['quantity', 'status'],
        raw: true,
      });
      activeRows.forEach((r) => {
        const qty = parseInt(r.quantity, 10) || 1;
        if (r.status === 'order_drink') {
          barQueue += qty;
        } else {
          kitchenQueue += qty;
        }
      });
    } catch (e) {
      console.warn('Dashboard: kitchenQueue query fallback:', e.message);
    }

    // 6. Pending staff calls
    let pendingStaffCalls = 0;
    try {
      pendingStaffCalls = await StaffCall.count({
        where: { restaurant_id: restaurantId, status: 'pending' },
      });
    } catch (e) {
      pendingStaffCalls = 0;
    }

    // 7. Channel totals
    let tableOrdersCount = 0;
    let onlineOrdersCount = 0;
    let tableSales = 0;
    let onlineSales = 0;
    let sales = 0;

    completedOrders.forEach((o) => {
      const cost = parseFloat(o.total_cost || 0);
      sales += cost;
      if (o.qr_type && o.qr_type.toLowerCase().includes('table')) {
        tableOrdersCount++;
        tableSales += cost;
      } else {
        onlineOrdersCount++;
        onlineSales += cost;
      }
    });

    const averageTicket = completedOrders.length > 0 ? sales / completedOrders.length : 0;

    return res.render('res/dashboard', {
      currentUser: user,
      stats: {
        sales,
        completedOrders: completedOrders.length,
        averageTicket,
        activeTables: activeTablesCount,
        totalTables: totalTablesCount,
        menuCount,
        soldOutCount,
        kitchenQueue,
        barQueue,
        pendingStaffCalls,
        onlineOrdersCount,
        tableOrdersCount,
        tableSales,
        onlineSales,
      },
      recentOrders: recentOrders || [],
    });
  } catch (err) {
    console.error('CRITICAL Dashboard Controller Error:', err);
    return res.status(500).send(`Server Error: ${err.message}`);
  }
}

module.exports = { index };