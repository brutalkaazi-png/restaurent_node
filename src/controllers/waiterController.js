const { Op } = require('sequelize');
const { User } = require('../models');
const { hashPassword } = require('../utils/password');

// Ported from app/Http/Controllers/SuperAdmin/WaiterController.php.
// Waiters are just `users` rows with user_role='waiter' and waiter_id
// pointing back at the restaurant owner's own id - same trick the User
// model's `waiters`/`restaurant` associations in models/index.js use.

// GET /waiters
async function index(req, res) {
  const waiters = await User.findAll({ where: { user_role: 'waiter', waiter_id: req.currentUser.id } });
  return res.render('res/waiter/index', { waiters });
}

// GET /waiters/create
function create(req, res) {
  return res.render('res/waiter/create', { waiter: null, errors: [] });
}

// POST /waiters
async function store(req, res) {
  const { name, email, password, password_confirmation: passwordConfirmation, address } = req.body;

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!email) errors.push('Email is required.');
  if (!password || password.length < 8) errors.push('Password must be at least 8 characters.');
  if (password !== passwordConfirmation) errors.push('Password confirmation does not match.');
  if (email) {
    const existing = await User.findOne({ where: { email } });
    if (existing) errors.push('That email address is already in use.');
  }

  if (errors.length) {
    return res.status(422).render('res/waiter/create', { waiter: null, errors });
  }

  await User.create({
    name,
    email,
    password: await hashPassword(password),
    address,
    user_type: 'R',
    user_role: 'waiter',
    status: 'approved',
    waiter_id: req.currentUser.id,
  });

  return res.redirect('/waiters');
}

// GET /waiters/:id/edit
async function edit(req, res) {
  const waiter = await User.findOne({ where: { id: req.params.id, waiter_id: req.currentUser.id } });
  if (!waiter) return res.status(404).send('Not found');
  return res.render('res/waiter/create', { waiter, errors: [] });
}

// POST /waiters/:id  (update - matches the plain-HTML-form POST convention used elsewhere in this port)
async function update(req, res) {
  const waiter = await User.findOne({ where: { id: req.params.id, waiter_id: req.currentUser.id } });
  if (!waiter) return res.status(404).send('Not found');

  const { name, email, password, password_confirmation: passwordConfirmation, address } = req.body;

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!email) errors.push('Email is required.');
  if (email) {
    const existing = await User.findOne({ where: { email, id: { [Op.ne]: waiter.id } } });
    if (existing) errors.push('That email address is already in use.');
  }
  if (password && (password.length < 8 || password !== passwordConfirmation)) {
    errors.push('Password must be at least 8 characters and match confirmation.');
  }

  if (errors.length) {
    return res.status(422).render('res/waiter/create', { waiter, errors });
  }

  waiter.name = name;
  waiter.email = email;
  waiter.address = address;
  if (password) waiter.password = await hashPassword(password);
  await waiter.save();

  return res.redirect('/waiters');
}

// POST /waiters/:id/delete
async function destroy(req, res) {
  const waiter = await User.findOne({ where: { id: req.params.id, waiter_id: req.currentUser.id } });
  if (waiter) await waiter.destroy();
  return res.redirect('/waiters');
}

module.exports = { index, create, store, edit, update, destroy };
