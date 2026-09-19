const { Order, OrderItem, Item, ItemVariant } = require('../models');

// GET /order/:id
async function show(req, res) {
  const order = await Order.findByPk(req.params.id, {
    include: [
      {
        model: OrderItem,
        as: 'order_items',
        include: [
          { model: Item, as: 'item' },
          { model: ItemVariant, as: 'variant' },
        ],
      },
    ],
  });
  if (!order) return res.status(404).send('Order not found.');
  return res.render('order', { order });
}

module.exports = { show };
