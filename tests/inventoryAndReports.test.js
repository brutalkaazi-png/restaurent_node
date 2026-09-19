const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { resetDatabase, seedBaseline, getApp, closeAll } = require('./helpers/setup');

let app;
let fixture;
let owner;

before(async () => {
  await resetDatabase();
  fixture = await seedBaseline();
  app = getApp();
  owner = request.agent(app);
  await owner.post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });
});

after(async () => {
  await closeAll();
});

test('inventory stock-in/stock-out math is correct and over-withdrawal is rejected', async () => {
  const { InventoryItem } = require('../src/models');

  const createRes = await owner.post('/inventory').type('form').send({ name: 'Rice', unit: 'kg', quantity: 100, price_per_unit: 1.2 });
  assert.equal(createRes.status, 302);

  const item = await InventoryItem.findOne({ where: { name: 'Rice' } });
  assert.equal(Number(item.quantity), 100);

  await owner.post(`/inventory/${item.id}/stock-in`).type('form').send({ quantity: 50, notes: 'Delivery' });
  await owner.post(`/inventory/${item.id}/stock-out`).type('form').send({ quantity: 30, notes: 'Used in kitchen' });

  const afterMoves = await InventoryItem.findByPk(item.id);
  assert.equal(Number(afterMoves.quantity), 120); // 100 + 50 - 30

  const overWithdraw = await owner.post(`/inventory/${item.id}/stock-out`).type('form').send({ quantity: 99999, notes: 'too much' });
  assert.equal(overWithdraw.status, 422);
  assert.match(overWithdraw.text, /cannot exceed/);

  const unchanged = await InventoryItem.findByPk(item.id);
  assert.equal(Number(unchanged.quantity), 120); // rejected withdrawal must not have applied
});

test('order-summary and per-item order reports split online vs. table orders correctly', async () => {
  const { Category, Item, Order, OrderItem } = require('../src/models');

  const drinksCategory = await Category.create({ user_id: fixture.restaurant.id, category_name: 'Drinks', category_order: 2 });
  const icedTea = await Item.create({
    user_id: fixture.restaurant.id,
    item_name: 'Iced Tea',
    item_slug: 'iced-tea',
    item_category: drinksCategory.id,
    price: 3.0,
    item_order: 1,
  });

  const onlineOrder = await Order.create({ res_id: fixture.restaurant.id, name: 'Order A', total_cost: 23, order_status: 'completed', qr_type: 'Order Online QR' });
  await OrderItem.create({ order_id: onlineOrder.id, item_id: fixture.item.id, price: 10, qty: 2, total: 20 });
  await OrderItem.create({ order_id: onlineOrder.id, item_id: icedTea.id, price: 3, qty: 1, total: 3 });

  const tableOrder = await Order.create({ res_id: fixture.restaurant.id, name: 'Order B', total_cost: 6, order_status: 'completed', qr_type: 'Table Based QR' });
  await OrderItem.create({ order_id: tableOrder.id, item_id: icedTea.id, price: 3, qty: 2, total: 6 });

  const summaryRes = await owner.get('/order-summary');
  assert.equal(summaryRes.status, 200);
  assert.match(summaryRes.text, />2<\/strong>/); // total order count
  assert.match(summaryRes.text, />29\.00<\/strong>/); // total sales

  const onlineReportRes = await owner.get('/order-report');
  assert.equal(onlineReportRes.status, 200);
  assert.match(onlineReportRes.text, /Spring Rolls/);
  assert.match(onlineReportRes.text, /2 sold/);

  const tableReportRes = await owner.get('/table-order-by-items');
  assert.equal(tableReportRes.status, 200);
  assert.match(tableReportRes.text, /Iced Tea/);
  assert.doesNotMatch(tableReportRes.text, /Spring Rolls/); // Spring Rolls was only in the online order
});
