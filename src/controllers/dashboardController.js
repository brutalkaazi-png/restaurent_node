const { Op } = require('sequelize');
const { Order, RestaurantTable, Item, TableCustomer } = require('../models');

// GET /dashboard
async function index(req, res) {
  const restaurantId = req.currentUser.id;
  const [completedOrders, activeTables, menuCount, soldOutCount, kitchenQueue] = await Promise.all([
    Order.findAll({ where: { res_id: restaurantId, order_status: 'completed' }, attributes: ['total_cost'] }),
    RestaurantTable.count({
      where: { restaurant_id: restaurantId, branch_id: req.branchId, is_virtual: false, status: { [Op.notIn]: ['available', 'bill_paid'] } },
    }),
    Item.count({ where: { user_id: restaurantId } }),
    Item.count({ where: { user_id: restaurantId, sold_out: true } }),
    TableCustomer.count({
      include: [{ association: 'table', where: { restaurant_id: restaurantId, branch_id: req.branchId }, attributes: [] }],
      where: { status: { [Op.in]: ['order_food', 'order_drink', 'preparing', 'cancelled_pending'] } },
    }),
  ]);

  const sales = completedOrders.reduce((sum, order) => sum + parseFloat(order.total_cost || 0), 0);
  const averageTicket = completedOrders.length ? sales / completedOrders.length : 0;

  return res.render('res/dashboard', {
    stats: {
      sales,
      completedOrders: completedOrders.length,
      averageTicket,
      activeTables,
      menuCount,
      soldOutCount,
      kitchenQueue,
    },
  });
}

module.exports = { index };
