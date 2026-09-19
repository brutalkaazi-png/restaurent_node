// Ports Laravel's 'auth' / 'guest' route middleware. Session user id is
// stored the same way Laravel's session-based auth guard does.

function ensureAuth(req, res, next) {
  if (req.session && req.session.userId) {
    return next();
  }
  return res.redirect('/login');
}

function ensureGuest(req, res, next) {
  if (req.session && req.session.userId) {
    return res.redirect('/home');
  }
  return next();
}

// Loads the logged-in user onto req.currentUser for use in controllers/views,
// the way Laravel's Auth::user() is available anywhere in a request.
function loadCurrentUser(User) {
  return async (req, res, next) => {
    if (req.session && req.session.userId) {
      req.currentUser = await User.findByPk(req.session.userId);
      res.locals.currentUser = req.currentUser;
    } else {
      res.locals.currentUser = null;
    }
    next();
  };
}

// Ports the custom role-gate middlewares referenced in routes/web.php
// ('res', 'superadmin', 'kitchen.admin', 'counter.admin', 'subscription.check').
// Only wired up here; apply to a route group once you port that module.
function requireUserType(type) {
  return (req, res, next) => {
    if (req.currentUser && req.currentUser.user_type === type) {
      return next();
    }
    return res.status(403).send('Forbidden');
  };
}

// Ports app/Http/Middleware/CheckKitchenAdmin.php - K (kitchen staff) or R
// (the restaurant owner themself) may access kitchen/bar screens.
function requireKitchenAdmin(req, res, next) {
  if (req.currentUser && (req.currentUser.user_type === 'K' || (req.currentUser.user_type === 'R' && req.currentUser.user_role !== 'waiter'))) {
    return next();
  }
  req.session.loginMessage = 'You do not have permission to access this page.';
  return res.redirect('/login');
}

// Ports app/Http/Middleware/CheckCounterAdmin.php - Co (counter staff) or R
// (the restaurant owner themself) may access the counter screen.
function requireCounterAdmin(req, res, next) {
  if (req.currentUser && (req.currentUser.user_type === 'Co' || (req.currentUser.user_type === 'R' && req.currentUser.user_role !== 'waiter'))) {
    return next();
  }
  req.session.loginMessage = 'You do not have permission to access this page.';
  return res.redirect('/login');
}

// Ports app/Http/Middleware/ResMiddleware.php - only restaurant owners
// (user_type 'R') may access their own management screens.
function requireRestaurantOwner(req, res, next) {
  if (req.currentUser && req.currentUser.user_type === 'R' && req.currentUser.user_role !== 'waiter') {
    return next();
  }
  if (req.currentUser) return res.status(401).send('Unauthorized');
  return res.redirect('/');
}

// Ports app/Http/Middleware/AdminMiddleware.php - only platform admins
// (user_type 'S') may access the /superadmin/* screens.
function requireSuperAdmin(req, res, next) {
  if (req.currentUser && req.currentUser.user_type === 'S') {
    return next();
  }
  if (req.currentUser) return res.status(401).send('Unauthorized');
  return res.redirect('/');
}

module.exports = {
  ensureAuth,
  ensureGuest,
  loadCurrentUser,
  requireUserType,
  requireKitchenAdmin,
  requireCounterAdmin,
  requireRestaurantOwner,
  requireSuperAdmin,
};
