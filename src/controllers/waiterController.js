const { Op } = require('sequelize');
const { User } = require('../models');
const { hashPassword } = require('../utils/password');

// GET /waiters (fetches all staff belonging to this restaurant: Waiters, Kitchen, Counter)
async function index(req, res) {
  const staff = await User.findAll({
    where: {
      waiter_id: req.currentUser.id,
      [Op.or]: [
        { user_role: 'waiter' },
        { user_type: { [Op.in]: ['K', 'Co'] } },
      ],
    },
    order: [['created_at', 'DESC']],
  });
  return res.render('res/waiter/index', { waiters: staff });
}

// GET /waiters/create
function create(req, res) {
  return res.render('res/waiter/create', { waiter: null, errors: [] });
}

// POST /waiters (creates staff: Waiter, Kitchen, or Counter)
async function store(req, res) {
  const { name, email, password, password_confirmation: passwordConfirmation, address, phone, role } = req.body;

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!email) errors.push('Email is required.');
  if (!password || password.length < 6) errors.push('Password must be at least 6 characters.');
  if (password !== passwordConfirmation) errors.push('Password confirmation does not match.');

  if (email) {
    const existing = await User.findOne({ where: { email: email.trim().toLowerCase() } });
    if (existing) errors.push('That email address is already in use.');
  }

  if (errors.length) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(422).json({ success: false, errors });
    }
    return res.status(422).render('res/waiter/create', { waiter: null, errors });
  }

  // Determine user_type & user_role based on selected staff role
  let user_type = 'R';
  let user_role = 'waiter';

  if (role === 'kitchen') {
    user_type = 'K';
    user_role = null;
  } else if (role === 'counter') {
    user_type = 'Co';
    user_role = null;
  }

  const staff = await User.create({
    name: name.trim(),
    email: email.trim().toLowerCase(),
    password: await hashPassword(password),
    address: address ? address.trim() : null,
    phone: phone ? phone.trim() : null,
    user_type,
    user_role,
    status: 'approved',
    waiter_id: req.currentUser.id,
  });

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, staff });
  }
  return res.redirect('/waiters');
}

// GET /waiters/:id/edit
async function edit(req, res) {
  const waiter = await User.findOne({ where: { id: req.params.id, waiter_id: req.currentUser.id } });
  if (!waiter) return res.status(404).send('Not found');
  return res.render('res/waiter/create', { waiter, errors: [] });
}

// POST /waiters/:id (updates staff details & role)
async function update(req, res) {
  const waiter = await User.findOne({ where: { id: req.params.id, waiter_id: req.currentUser.id } });
  if (!waiter) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(404).json({ success: false, message: 'Staff member not found.' });
    }
    return res.status(404).send('Not found');
  }

  const { name, email, password, password_confirmation: passwordConfirmation, address, phone, role } = req.body;

  const errors = [];
  if (!name) errors.push('Name is required.');
  if (!email) errors.push('Email is required.');

  if (email) {
    const existing = await User.findOne({
      where: { email: email.trim().toLowerCase(), id: { [Op.ne]: waiter.id } },
    });
    if (existing) errors.push('That email address is already in use.');
  }

  if (password && (password.length < 6 || password !== passwordConfirmation)) {
    errors.push('Password must be at least 6 characters and match confirmation.');
  }

  if (errors.length) {
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(422).json({ success: false, errors });
    }
    return res.status(422).render('res/waiter/create', { waiter, errors });
  }

  waiter.name = name.trim();
  waiter.email = email.trim().toLowerCase();
  waiter.address = address ? address.trim() : null;
  if (phone) waiter.phone = phone.trim();

  if (role === 'kitchen') {
    waiter.user_type = 'K';
    waiter.user_role = null;
  } else if (role === 'counter') {
    waiter.user_type = 'Co';
    waiter.user_role = null;
  } else {
    waiter.user_type = 'R';
    waiter.user_role = 'waiter';
  }

  if (password) {
    waiter.password = await hashPassword(password);
  }
  await waiter.save();

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true, waiter });
  }
  return res.redirect('/waiters');
}

// POST /waiters/:id/delete
async function destroy(req, res) {
  const waiter = await User.findOne({ where: { id: req.params.id, waiter_id: req.currentUser.id } });
  if (waiter) {
    await waiter.destroy();
  }

  if (req.xhr || req.headers.accept?.includes('application/json')) {
    return res.json({ success: true });
  }
  return res.redirect('/waiters');
}

module.exports = { index, create, store, edit, update, destroy };