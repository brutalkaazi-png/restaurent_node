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

test('kitchen board renders active ticket details and urgency controls', async () => {
  const { TableCustomer } = require('../src/models');
  await TableCustomer.create({
    table_id: fixture.table.id,
    item_id: fixture.item.id,
    quantity: 2,
    status: 'order_food',
    remarks: 'No onions',
  });

  const response = await owner.get('/kitchen-admin/kitchen');

  assert.equal(response.status, 200);
  assert.match(response.text, /Kitchen ticket board/);
  assert.match(response.text, /Table 1/);
  assert.match(response.text, /Spring Rolls/);
  assert.match(response.text, /No onions/);
  assert.match(response.text, /data-created-at=/);
  assert.match(response.text, /data-elapsed/);
  assert.match(response.text, /Filter kitchen tickets by category/);
  assert.match(response.text, /Sold out/);
});

test('kitchen can advance a ticket and toggle sold-out state for its restaurant', async () => {
  const { Item, TableCustomer } = require('../src/models');
  const row = await TableCustomer.create({
    table_id: fixture.table.id,
    item_id: fixture.item.id,
    quantity: 1,
    status: 'order_food',
  });

  const statusResponse = await owner.get(`/kitchen-admin/kitchen/update-order/${row.id}?action=preparing`);
  assert.equal(statusResponse.status, 200);
  assert.equal(statusResponse.body.success, true);
  assert.equal((await row.reload()).status, 'preparing');

  const soldOutResponse = await owner.post(`/kitchen-admin/kitchen/toggle-sold-out/${fixture.item.id}`);
  assert.equal(soldOutResponse.status, 200);
  assert.equal(soldOutResponse.body.sold_out, true);
  assert.equal((await Item.findByPk(fixture.item.id)).sold_out, true);
});
