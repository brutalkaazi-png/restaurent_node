const { Op } = require('sequelize');
const { User, District, MenuTemplate, Branch } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');
const { hashPassword } = require('../utils/password');

// GET /register, /user-register
async function showRegister(req, res) {
  if (req.session.userId) {
    const user = await User.findByPk(req.session.userId);
    if (user) {
      if (user.user_type === 'S') return res.redirect('/superadmin/dashboard');
      if (user.user_type === 'R') return res.redirect('/dashboard');
      if (user.user_type === 'K') return res.redirect('/kitchen-admin/kitchen');
      if (user.user_type === 'Co') return res.redirect(`/counter-admin/${user.slug}/counter`);
    }
  }
  let districts = [];
  try {
    districts = await District.findAll();
  } catch (e) {
    districts = [];
  }
  res.render('auth/register', { districts, errors: [] });
}

// POST /register/store
async function storeRegister(req, res) {
  try {
    const {
      name,
      slug: slugInput,
      city,
      address,
      latitude,
      longitude,
      phone,
      email,
      password,
      password_confirmation,
      user_type = 'R',
    } = req.body;

    const errors = [];
    if (!name || !name.trim()) errors.push('Name is required.');
    if (!email || !email.trim()) errors.push('A valid email address is required.');
    if (!password || password.length < 6 || password !== password_confirmation) {
      errors.push('Password must be at least 6 characters and match confirmation.');
    }

    const cleanEmail = String(email || '').toLowerCase().trim();
    const existing = await User.findOne({ where: { email: cleanEmail } });
    if (existing) {
      errors.push('The email address is already registered.');
    }

    if (errors.length) {
      let districts = [];
      try { districts = await District.findAll(); } catch (e) {}
      return res.status(422).render('auth/register', { districts, errors });
    }

    let slug = sanitizeString(slugInput || name);
    const existingSlugs = (
      await User.findAll({ where: { slug: { [Op.like]: `%${slug}%` } }, attributes: ['slug'] })
    ).map((u) => u.slug);

    let i = 2;
    while (existingSlugs.includes(slug)) {
      slug = `${slug}-${i}`;
      i++;
    }

    const now = new Date();
    // Create approved user account
    const user = await User.create({
      name: name.trim(),
      slug,
      city: city || 'Central',
      address: address ? address.trim() : null,
      latlng: `${latitude || ''},${longitude || ''}`,
      phone: phone ? phone.trim() : null,
      email: cleanEmail,
      password: await hashPassword(password),
      user_type: user_type === 'C' ? 'C' : 'R',
      status: 'approved', // Auto-approved for frictionless onboarding
      otp: '00000',
      theme_primary_color: '#f97316',
      theme_secondary_color: '#ea580c',
      theme_heading_text_color: '#ffffff',
      theme_background_color: '#ffffff',
      theme_outer_background_color: '#f8fafc',
      theme_accent_color: '#10b981',
    });

    // If Restaurant Owner, create default Main Branch & Menu Template
    if (user.user_type === 'R') {
      try {
        await Branch.create({
          restaurant_id: user.id,
          name: 'Main Branch',
          slug: 'main',
          is_active: true,
          created_at: now,
          updated_at: now,
        });
      } catch (branchErr) {
        console.warn('Branch auto-create notice:', branchErr.message);
      }

      try {
        await MenuTemplate.create({
          user_id: user.id,
          template_id: 1,
          show_product_image: true,
          show_category_image: true,
        });
      } catch (tplErr) {}

      // Auto log-in to immediately access dashboard
      req.session.userId = user.id;
      return res.redirect('/dashboard');
    }

    // If Customer Account, auto log-in
    req.session.userId = user.id;
    return res.redirect('/login');
  } catch (err) {
    console.error('Registration error:', err);
    let districts = [];
    try { districts = await District.findAll(); } catch (e) {}
    return res.status(500).render('auth/register', {
      districts,
      errors: ['An unexpected error occurred while creating your account. Please try again.'],
    });
  }
}

module.exports = { showRegister, storeRegister };