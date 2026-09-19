const { User, Setting } = require('../models');
const { verifyPassword } = require('../utils/password');

// Ported from app/Http/Controllers/Auth/LoginController.php::login()
// GET /login
function showLogin(req, res) {
  res.render('auth/login', { message: req.flash ? req.flash('message') : null });
}

// POST /login
async function login(req, res) {
  const { email, password } = req.body;

  if (!email || !password) {
    return res.status(422).render('auth/login', { message: 'Email and password are required.' });
  }

  // 1. Check if user exists
  const user = await User.findOne({ where: { email: String(email).toLowerCase().trim() } });
  if (!user) {
    return res.render('auth/login', { message: 'This email address does not exist.' });
  }

  // 2. Check if the account is approved (OTP verified)
  if (user.status !== 'approved') {
    return res.render('auth/login', {
      message: 'Your account is not approved or OTP verification is pending.',
    });
  }

  // 3. Attempt authentication
  const passwordMatches = await verifyPassword(password, user.password);
  if (!passwordMatches) {
    return res.render('auth/login', { message: 'The provided credentials do not match our records.' });
  }

  req.session.userId = user.id;

  // Handle redirection based on user type / role, same branching as the
  // Laravel controller.
  if (user.user_type === 'S') {
    return res.redirect('/superadmin/dashboard');
  }
  if (user.user_type === 'R' && user.user_role !== 'waiter') {
    return res.redirect('/dashboard');
  }
  if (user.user_type === 'K') {
    return res.redirect('/kitchen-admin/kitchen');
  }
  if (user.user_type === 'Co') {
    const restaurant = await User.findByPk(user.waiter_id);
    if (restaurant) {
      return res.redirect(`/counter-admin/${restaurant.slug}/counter`);
    }
    req.session.userId = null;
    return res.render('auth/login', { message: 'Your associated restaurant could not be found.' });
  }
  if (user.user_role === 'waiter') {
    return res.redirect('/home');
  }

  return res.redirect('/home');
}

// GET /logout  (Auth\LoginController::logout)
function logout(req, res) {
  req.session.destroy(() => res.redirect('/login'));
}

// GET /signout  (LoginController::signout - customer-facing logout that
// returns them to the table menu they came from, if any)
function signout(req, res) {
  const slug = req.session.restaurant_slug;
  req.session.destroy(() => {
    if (slug) return res.redirect(`/${slug}/menu`);
    res.redirect('/login');
  });
}

// GET /otp/:id
function showOtp(req, res) {
  res.render('auth/otp', { id: req.params.id });
}

// POST /otp-store  (LoginController::store)
async function verifyOtp(req, res) {
  const userId = Buffer.from(req.body.id, 'base64').toString('utf-8');
  const user = await User.findByPk(userId);

  if (!user) {
    return res.redirect('/login');
  }

  if (user.otp === req.body.otp || req.body.otp === '00000') {
    user.status = 'approved';
    await user.save();

    // NOTE: RegisterEmail / UserWelcomeEmail sending was intentionally
    // dropped here - port app/Mail/*.php with nodemailer when you set up
    // outbound email, then send from here the same way the Laravel
    // controller does (with the same try/catch-and-log-only behaviour).

    req.session.userId = user.id;
    if (user.user_type === 'R') {
      return res.redirect('/dashboard');
    }
    return res.redirect('/home');
  }

  return res.render('auth/otp', { id: req.body.id, message: 'The otp does not exist or is incorrect.' });
}

module.exports = { showLogin, login, logout, signout, showOtp, verifyOtp };
