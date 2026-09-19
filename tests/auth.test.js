const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const request = require('supertest');
const { resetDatabase, seedBaseline, getApp, closeAll } = require('./helpers/setup');

let app;

before(async () => {
  await resetDatabase();
  await seedBaseline();
  app = getApp();
});

after(async () => {
  await closeAll();
});

test('login with correct credentials redirects a restaurant owner to /dashboard', async () => {
  const res = await request(app).post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/dashboard');
});

test('login with wrong password is rejected (no redirect)', async () => {
  const res = await request(app).post('/login').type('form').send({ email: 'owner@example.com', password: 'wrong-password' });
  assert.equal(res.status, 200); // re-renders the login form with an error, not a redirect
  assert.match(res.text, /credentials do not match/i);
});

test('login with unknown email is rejected', async () => {
  const res = await request(app).post('/login').type('form').send({ email: 'nobody@example.com', password: 'password123' });
  assert.equal(res.status, 200);
  assert.match(res.text, /does not exist/i);
});

test('unauthenticated request to a protected page redirects to /login', async () => {
  const res = await request(app).get('/dashboard');
  assert.equal(res.status, 302);
  assert.equal(res.headers.location, '/login');
});

test('a waiter created for a restaurant logs in and redirects to /home, not /dashboard', async () => {
  const agent = request.agent(app);
  await agent.post('/login').type('form').send({ email: 'owner@example.com', password: 'password123' });

  const createRes = await agent
    .post('/waiters')
    .type('form')
    .send({ name: 'Bob Waiter', email: 'bob@example.com', password: 'waiterpass1', password_confirmation: 'waiterpass1' });
  assert.equal(createRes.status, 302);
  assert.equal(createRes.headers.location, '/waiters');

  const waiterLogin = await request(app).post('/login').type('form').send({ email: 'bob@example.com', password: 'waiterpass1' });
  assert.equal(waiterLogin.status, 302);
  assert.equal(waiterLogin.headers.location, '/home');
});
