const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { resetDatabase, seedBaseline, getApp, closeAll } = require('./helpers/setup');

let app;
let fixture;

before(async () => {
  await resetDatabase();
  fixture = await seedBaseline();
  app = getApp();
});

after(async () => {
  await closeAll();
});

test('full dine-in order lifecycle: menu -> cart -> confirm -> kitchen -> billed', async () => {
  const { sequelize, TableCustomer, RestaurantTable, Order, OrderItem } = require('../src/models');
  const guest = request.agent(app);

  // 1. Load the table menu - this auto-occupies the table and starts a session.
  const menuRes = await guest.get(`/${fixture.restaurant.slug}/menu/${fixture.table.table_slug}`);
  assert.equal(menuRes.status, 200);
  assert.match(menuRes.text, /Spring Rolls/);
  assert.ok(menuRes.headers['set-cookie']?.some((cookie) => cookie.startsWith('connect.sid=')));

  const occupiedTable = await RestaurantTable.findByPk(fixture.table.id);
  assert.equal(occupiedTable.status, 'occupied');

  // 2. Add 2x Spring Rolls to the cart.
  const addRes = await guest
    .post('/add-table-menu')
    .send({ table_id: fixture.table.id, items: [{ item_id: fixture.item.id, quantity: 2 }] });
  assert.equal(addRes.status, 200);
  assert.equal(addRes.body.success, 'Items added to cart successfully.');

  const cartRows = await TableCustomer.findAll({ where: { table_id: fixture.table.id, status: 'add_to_cart' } });
  assert.equal(cartRows.length, 1);
  assert.equal(cartRows[0].quantity, 2);
  assert.equal(Number(cartRows[0].price), 10);

  // 3. Confirm the order - should flip status to confirmed, then to order_food
  // (not a drink) since sendToKitchen() runs for a non-pay-first restaurant.
  const confirmRes = await guest.post('/tablecart/store').send({ table_id: fixture.table.id });
  assert.equal(confirmRes.status, 200);
  assert.equal(confirmRes.body.success, true);

  const confirmedRow = await TableCustomer.findOne({ where: { table_id: fixture.table.id } });
  assert.equal(confirmedRow.status, 'order_food');

  // 4. Owner logs in and moves the item through the kitchen board.
  const owner = request.agent(app);
  await owner.post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });

  const prepRes = await owner.get(`/kitchen-admin/kitchen/update-order/${confirmedRow.id}?action=preparing`);
  assert.equal(prepRes.status, 200);
  const deliveredRes = await owner.get(`/kitchen-admin/kitchen/update-order/${confirmedRow.id}?action=order_delivered`);
  assert.equal(deliveredRes.status, 200);

  const deliveredRow = await TableCustomer.findByPk(confirmedRow.id);
  assert.equal(deliveredRow.status, 'order_delivered');

  // 5. Counter completes the order for this table - should create a real
  // Order + OrderItem, and reset the table back to available.
  const completeRes = await owner
    .post(`/counter-admin/complete_order/${fixture.table.id}`)
    .send({ item_ids: [String(deliveredRow.id)], discount_percent: 0, tax_percent: 0 });
  assert.equal(completeRes.status, 200);
  assert.equal(completeRes.body.success, 'Order completed successfully.');

  const order = await Order.findOne({ where: { table_id: fixture.table.id } });
  assert.ok(order, 'expected an Order row to have been created');
  assert.equal(Number(order.total_cost), 20); // 2 x $10

  const orderItem = await OrderItem.findOne({ where: { order_id: order.id } });
  assert.equal(orderItem.qty, 2);
  assert.equal(Number(orderItem.total), 20);

  const finalTable = await RestaurantTable.findByPk(fixture.table.id);
  assert.equal(finalTable.status, 'available');
  assert.equal(finalTable.table_token, null);

  const remainingCartRows = await TableCustomer.count({ where: { table_id: fixture.table.id } });
  assert.equal(remainingCartRows, 0);
});
