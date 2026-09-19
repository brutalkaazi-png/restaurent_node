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

test('guest delivery/pickup checkout creates a requested Order the counter can approve', async () => {
  const { Order, RestaurantTable } = require('../src/models');
  const guest = request.agent(app);

  const menuRes = await guest.get(`/${fixture.restaurant.slug}/menu`);
  assert.equal(menuRes.status, 200);

  const addRes = await guest
    .post('/add-to-cart')
    .send({ items: [{ item_id: fixture.item.id, quantity: 3, comment: 'extra sauce' }] });
  assert.equal(addRes.status, 200);
  assert.equal(addRes.body.totalItem, 1);

  const checkoutPage = await guest.get('/checkout');
  assert.equal(checkoutPage.status, 200);
  assert.match(checkoutPage.text, /Checkout/);

  const orderRes = await guest.post('/store_order').type('form').send({
    name: 'Jane Guest',
    email: 'jane@example.com',
    phone: '555-1234',
    delivery_type: 'pickup',
    total_cost: 30,
    delivery_charge: 0,
  });
  assert.equal(orderRes.status, 302);
  assert.match(orderRes.headers.location, /^\/order\/\d+$/);

  const order = await Order.findOne({ where: { name: 'Jane Guest' } });
  assert.ok(order);
  assert.equal(order.order_status, 'requested');
  assert.equal(order.qr_type, 'Order Online QR');

  const orderPage = await guest.get(`/order/${order.id}`);
  assert.equal(orderPage.status, 200);
  assert.match(orderPage.text, /Jane Guest/);

  // Owner approves it from the counter's pending-online-orders panel -
  // should create a virtual table and route the item to the kitchen.
  const owner = request.agent(app);
  await owner.post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });

  const pendingRes = await owner.get(`/counter-admin/get-online-orders/${fixture.restaurant.id}`);
  assert.equal(pendingRes.status, 200);
  assert.equal(pendingRes.body.count, 1);

  const approveRes = await owner.post(`/counter-admin/approve-order/${order.id}`);
  assert.equal(approveRes.status, 200);
  assert.equal(approveRes.body.success, true);

  const updatedOrder = await Order.findByPk(order.id);
  assert.equal(updatedOrder.order_status, 'approved');
  assert.ok(updatedOrder.table_id, 'expected a virtual table to have been created and linked');

  const virtualTable = await RestaurantTable.findByPk(updatedOrder.table_id);
  assert.equal(virtualTable.is_virtual, true);
});
