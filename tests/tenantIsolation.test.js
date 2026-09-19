const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { resetDatabase, seedBaseline, getApp, closeAll } = require('./helpers/setup');

let app;
let fixture;
let owner;
let otherRestaurant;
let otherItem;
let otherTable;

before(async () => {
  await resetDatabase();
  fixture = await seedBaseline();
  const { User, Branch, Category, Item, RestaurantTable } = require('../src/models');
  otherRestaurant = await User.create({
    name: 'Other Restaurant',
    slug: 'other-restaurant',
    email: 'other.owner@example.com',
    password: await bcrypt.hash('password123', 10),
    user_type: 'R',
    status: 'approved',
  });
  const otherBranch = await Branch.create({ restaurant_id: otherRestaurant.id, name: 'Other Main', slug: 'main', is_active: true });
  const otherCategory = await Category.create({ user_id: otherRestaurant.id, branch_id: otherBranch.id, category_name: 'Other Menu' });
  otherItem = await Item.create({
    user_id: otherRestaurant.id,
    branch_id: otherBranch.id,
    item_name: 'Other Item',
    item_slug: 'other-item',
    item_category: otherCategory.id,
    price: 12,
  });
  otherTable = await RestaurantTable.create({
    restaurant_id: otherRestaurant.id,
    branch_id: otherBranch.id,
    table_name: 'Other Table',
    table_slug: 'other-table',
    status: 'available',
  });

  app = getApp();
  owner = request.agent(app);
  await owner.post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });
});

after(async () => {
  await closeAll();
});

test('owner cannot read or mutate another restaurant menu and table records', async () => {
  const menuPage = await owner.get(`/menus/${otherItem.id}/edit`);
  assert.equal(menuPage.status, 404);

  const toggle = await owner.post(`/menus/${otherItem.id}/toggle-sold-out`).set('Accept', 'application/json');
  assert.equal(toggle.status, 404);

  const deleteTable = await owner.post(`/tables/${otherTable.id}/delete`);
  assert.equal(deleteTable.status, 302);

  const { RestaurantTable, Item } = require('../src/models');
  assert.ok(await RestaurantTable.findByPk(otherTable.id));
  assert.equal((await Item.findByPk(otherItem.id)).sold_out, false);
});

test('owner cannot open another restaurant counter', async () => {
  const response = await owner.get(`/counter-admin/${otherRestaurant.slug}/counter`);
  assert.equal(response.status, 404);
});
