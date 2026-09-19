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

after(async () => closeAll());

test('owner can view and update a branch-scoped customer profile', async () => {
  const { CustomerProfile } = require('../src/models');
  const customer = await CustomerProfile.create({
    restaurant_id: fixture.restaurant.id,
    branch_id: fixture.branch.id,
    name: 'CRM Guest',
    email: 'crm@example.com',
    visit_count: 2,
    total_spend: 45,
  });

  const list = await owner.get('/customers?search=CRM');
  assert.equal(list.status, 200);
  assert.match(list.text, /CRM Guest/);

  const update = await owner.post(`/customers/${customer.id}`).type('form').send({ name: 'Updated Guest', notes: 'Prefers window table.' });
  assert.equal(update.status, 302);
  assert.equal((await customer.reload()).notes, 'Prefers window table.');
});
