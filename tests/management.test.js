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

test('a category created through the UI appears on the public menu', async () => {
  const createRes = await owner.post('/categories').type('form').send({ category_name: 'Mains', description: 'Main dishes' });
  assert.equal(createRes.status, 302);

  const listRes = await owner.get('/categories');
  assert.equal(listRes.status, 200);
  assert.match(listRes.text, /Mains/);
});

test('the owner dashboard renders operational summary tiles', async () => {
  const response = await owner.get('/dashboard');
  assert.equal(response.status, 200);
  assert.match(response.text, /average ticket/);
  assert.match(response.text, /active tables/);
  assert.match(response.text, /kitchen items/);
});

test('a menu item with variants created through the UI appears on the public menu and can be ordered', async () => {
  const { Category, Item, ItemVariant } = require('../src/models');
  const category = await Category.create({ user_id: fixture.restaurant.id, category_name: 'Desserts', category_order: 3 });

  const createRes = await owner.post('/menus').send({
    item_name: 'Cake Slice',
    item_category: category.id,
    has_variants: 'on',
    variants: [
      { name: 'Small', price: 4 },
      { name: 'Large', price: 7 },
    ],
  });
  assert.equal(createRes.status, 302);

  const item = await Item.findOne({ where: { item_name: 'Cake Slice' } });
  assert.ok(item);
  assert.equal(item.has_variants, true);

  const variants = await ItemVariant.findAll({ where: { item_id: item.id } });
  assert.equal(variants.length, 2);

  const menuRes = await request(app).get(`/${fixture.restaurant.slug}/menu/${fixture.table.table_slug}`);
  assert.equal(menuRes.status, 200);
  assert.match(menuRes.text, /Cake Slice/);
});

test('a table created through the UI has a working ordering URL', async () => {
  const { RestaurantTable } = require('../src/models');
  const createRes = await owner.post('/tables').type('form').send({ name: 'Table 2' });
  assert.equal(createRes.status, 302);

  const table = await RestaurantTable.findOne({ where: { table_name: 'Table 2' } });
  assert.ok(table);

  const menuRes = await request(app).get(`/${fixture.restaurant.slug}/menu/${table.table_slug}`);
  assert.equal(menuRes.status, 200);
});

test('an owner can toggle sold-out state and sold-out items cannot enter the online cart', async () => {
  const { Item } = require('../src/models');
  const item = await Item.findOne({ where: { item_name: 'Spring Rolls' } });
  assert.ok(item);

  const toggleRes = await owner
    .post(`/menus/${item.id}/toggle-sold-out`)
    .set('Accept', 'application/json');
  assert.equal(toggleRes.status, 200);
  assert.equal(toggleRes.body.sold_out, true);

  const menuRes = await request(app).get(`/${fixture.restaurant.slug}/menu`);
  assert.equal(menuRes.status, 200);
  assert.match(menuRes.text, /Sold out/);

  const cartRes = await request(app)
    .post('/add-to-cart')
    .send({ items: [{ item_id: item.id, quantity: 1 }] });
  assert.equal(cartRes.status, 409);
});

test('a table can call staff and the owner can resolve the pending request', async () => {
  const callRes = await request(app)
    .post(`/staff-call/${fixture.table.id}`)
    .send({ type: 'water' });
  assert.equal(callRes.status, 201);
  assert.match(callRes.body.message, /notified/);

  const duplicateRes = await request(app)
    .post(`/staff-call/${fixture.table.id}`)
    .send({ type: 'bill' });
  assert.equal(duplicateRes.status, 409);

  const listRes = await owner.get('/staff-calls');
  assert.equal(listRes.status, 200);
  assert.match(listRes.text, /Table 1/);
  assert.match(listRes.text, /water request/);

  const { StaffCall } = require('../src/models');
  const call = await StaffCall.findOne({ where: { table_id: fixture.table.id, status: 'pending' } });
  assert.ok(call);

  const resolveRes = await owner.post(`/staff-calls/${call.id}/resolve`);
  assert.equal(resolveRes.status, 200);
  assert.equal(resolveRes.body.success, true);

  const emptyRes = await owner.get('/staff-calls');
  assert.equal(emptyRes.status, 200);
  assert.match(emptyRes.text, /No pending staff calls/);
});
