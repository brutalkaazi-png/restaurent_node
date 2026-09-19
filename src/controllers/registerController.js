const { Op } = require('sequelize');
const { User, District, MenuTemplate } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');
const { hashPassword } = require('../utils/password');

// GET /register, /user-register  (RegisterController::index)
async function showRegister(req, res) {
  if (req.session.userId) {
    const user = await User.findByPk(req.session.userId);
    if (user) {
      if (user.user_type === 'S') return res.redirect('/superadmin/dashboard');
      if (user.user_type === 'R') return res.redirect('/dashboard');
    }
  }
  const districts = await District.findAll();
  res.render('auth/register', { districts });
}

// POST /register/store  (RegisterController::store)
// NOTE: image/logo upload handling (MediaHelper::upload_image) is left as a
// TODO - wire up `multer` here when you port that piece, then set
// user.image / user.logo the same way.
async function storeRegister(req, res) {
  const { name, slug: slugInput, city, address, latitude, longitude, phone, email, password, password_confirmation, remark, restaurant_type, user_type } = req.body;

  if (!password || password.length < 6 || password !== password_confirmation) {
    return res.status(422).render('auth/register', {
      districts: await District.findAll(),
      errors: ['Password must be at least 6 characters and match confirmation.'],
    });
  }

  const existing = await User.findOne({ where: { email } });
  if (existing) {
    return res.status(422).render('auth/register', {
      districts: await District.findAll(),
      errors: ['The email address already exists'],
    });
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

  const otp = String(Math.floor(10000 + Math.random() * 90000)).slice(0, 5);

  const user = await User.create({
    name,
    slug,
    city,
    address,
    latlng: `${latitude || ''},${longitude || ''}`,
    phone,
    email,
    password: await hashPassword(password),
    remark,
    restaurant_type,
    user_type,
    status: 'pending',
    otp,
    theme_primary_color: '#333333',
    theme_secondary_color: '#FA983A',
    theme_heading_text_color: '#ffffff',
    theme_background_color: '#FDFBF0',
    theme_outer_background_color: '#f5f1e6',
    theme_accent_color: '#28a745',
  });

  await MenuTemplate.create({ user_id: user.id, template_id: 1 });

  // NOTE: OtpEmail send dropped here - see note in authController about
  // wiring up outbound email.

  if (user.user_type === 'R') {
    const encoded = Buffer.from(String(user.id)).toString('base64');
    return res.redirect(`/otp/${encoded}`);
  }
  if (user.user_type === 'C') {
    return res.redirect('/login');
  }
  return res.redirect('/login');
}

module.exports = { showRegister, storeRegister };
