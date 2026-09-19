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

test('a discount reduces both the displayed price and the actual cart price, rounded to the nearest $5', async () => {
  const { Item } = require('../src/models');
  await Item.update({ price: 20.0 }, { where: { id: fixture.item.id } });

  const createRes = await owner.post('/discounts').type('form').send({
    start_time: '00:00',
    end_time: '23:59',
    discount_percentage: 25,
    days: ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'],
    item_ids: [String(fixture.item.id)],
  });
  assert.equal(createRes.status, 302);

  // $20 at 25% off = $15, which is already a multiple of 5, so the
  // "round to nearest $5" rule doesn't obscure this test case.
  const menuRes = await request(app).get(`/${fixture.restaurant.slug}/menu/${fixture.table.table_slug}`);
  assert.equal(menuRes.status, 200);
  assert.match(menuRes.text, /\$15\.00/);
  assert.match(menuRes.text, /25(\.00)?% off now/);

  const guest = request.agent(app);
  await guest.get(`/${fixture.restaurant.slug}/menu/${fixture.table.table_slug}`);
  await guest.post('/add-table-menu').send({ table_id: fixture.table.id, items: [{ item_id: fixture.item.id, quantity: 1 }] });

  const { TableCustomer } = require('../src/models');
  const cartRow = await TableCustomer.findOne({ where: { table_id: fixture.table.id } });
  assert.equal(Number(cartRow.price), 15);
});

test('a promotion is hidden behind an inactive subscription and shown once one is active', async () => {
  const { UserSubscription, Subscription } = require('../src/models');

  const inactiveRes = await request(app).get(`/${fixture.restaurant.slug}/offer`);
  assert.equal(inactiveRes.status, 200);
  assert.match(inactiveRes.text, /subscription is currently inactive/);

  const createRes = await owner.post('/promotions').type('form').send({
    name: 'Happy Hour',
    start_date: '2026-01-01',
    end_date: '2026-12-31',
    is_active: 'Active',
    days: ['All Day'],
    item_ids: [String(fixture.item.id)],
    [`offer_price_${fixture.item.id}`]: '6.50',
  });
  assert.equal(createRes.status, 302);

  const plan = await Subscription.create({ name: 'Pro', month: 1, cost: '29.99' });
  await UserSubscription.create({
    user_id: fixture.restaurant.id,
    subscription_id: plan.id,
    payment_status: 'paid',
    subscription_status: 'active',
    subscription_start_date: '2026-01-01',
    subscription_end_date: '2026-12-31',
  });

  const activeRes = await request(app).get(`/${fixture.restaurant.slug}/offer`);
  assert.equal(activeRes.status, 200);
  assert.match(activeRes.text, /Happy Hour/);
  assert.doesNotMatch(activeRes.text, /subscription is currently inactive/);
});
