const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const bcrypt = require('bcryptjs');
const { resetDatabase, seedBaseline, getApp, closeAll } = require('./helpers/setup');

let app;
let fixture;

before(async () => {
  await resetDatabase();
  fixture = await seedBaseline();
  app = getApp();

  const { User } = require('../src/models');
  await User.create({
    name: 'Platform Admin',
    slug: 'admin',
    email: 'admin@example.com',
    password: await bcrypt.hash('password123', 10),
    status: 'approved',
    user_type: 'S',
  });
});

after(async () => {
  await closeAll();
});

test('a restaurant owner cannot access /superadmin routes', async () => {
  const owner = request.agent(app);
  await owner.post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });
  const res = await owner.get('/superadmin/dashboard');
  assert.equal(res.status, 401);
});

test('platform admin logs in, sees a pending restaurant, and can approve it', async () => {
  const { User } = require('../src/models');
  await User.create({
    name: 'New Restaurant',
    slug: 'new-restaurant',
    email: 'newres@example.com',
    password: await bcrypt.hash('password123', 10),
    status: 'pending',
    user_type: 'R',
  });

  const admin = request.agent(app);
  const loginRes = await admin.post('/login').type('form').send({ email: 'admin@example.com', password: 'password123' });
  assert.equal(loginRes.status, 302);
  assert.equal(loginRes.headers.location, '/superadmin/dashboard');

  const listRes = await admin.get('/superadmin/restaurants');
  assert.equal(listRes.status, 200);
  assert.match(listRes.text, /New Restaurant/);

  const newRestaurant = await User.findOne({ where: { email: 'newres@example.com' } });
  const approveRes = await admin.post('/superadmin/restaurant-change-status').type('form').send({ res_id: newRestaurant.id, status: 'approved' });
  assert.equal(approveRes.status, 302);

  const updated = await User.findByPk(newRestaurant.id);
  assert.equal(updated.status, 'approved');
});
