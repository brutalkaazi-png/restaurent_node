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

test('owner can create and update a reservation', async () => {
  const starts = new Date(Date.now() + 86400000);
  const ends = new Date(starts.getTime() + 90 * 60000);
  const response = await owner.post('/reservations').type('form').send({
    customer_name: 'Asha Guest',
    customer_phone: '555-0100',
    guest_count: 3,
    table_id: fixture.table.id,
    starts_at: starts.toISOString().slice(0, 16),
    ends_at: ends.toISOString().slice(0, 16),
  });
  assert.equal(response.status, 302);

  const { Reservation } = require('../src/models');
  const reservation = await Reservation.findOne({ where: { customer_name: 'Asha Guest' } });
  assert.ok(reservation);
  assert.equal(reservation.branch_id, fixture.branch.id);

  const status = await owner.post(`/reservations/${reservation.id}/status`).type('form').send({ status: 'confirmed' });
  assert.equal(status.status, 200);
  assert.equal((await reservation.reload()).status, 'confirmed');
});

test('overlapping reservations on one table are rejected', async () => {
  const starts = new Date(Date.now() + 172800000);
  const ends = new Date(starts.getTime() + 90 * 60000);
  const payload = { customer_name: 'First Guest', guest_count: 2, table_id: fixture.table.id, starts_at: starts.toISOString().slice(0, 16), ends_at: ends.toISOString().slice(0, 16) };
  assert.equal((await owner.post('/reservations').type('form').send(payload)).status, 302);
  assert.equal((await owner.post('/reservations').type('form').send({ ...payload, customer_name: 'Second Guest' })).status, 422);
});
