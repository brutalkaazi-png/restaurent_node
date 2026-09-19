const express = require('express');
const session = require('express-session');
const cookieParser = require('cookie-parser');
const expressLayouts = require('express-ejs-layouts');
const path = require('path');

const { User, Branch } = require('./models');
const { loadCurrentUser } = require('./middleware/auth');
const { loadTenantContext } = require('./middleware/tenant');
const webRoutes = require('./routes/web');

// Builds and returns a configured Express app, but does NOT connect to the
// database, initialize Socket.IO, or start listening - server.js does all
// three of those around this. Tests import this module directly and drive
// it with supertest, which doesn't need a real listening port.
function createApp() {
  const app = express();

  app.set('view engine', 'ejs');
  app.set('views', path.join(__dirname, 'views'));
  app.use(expressLayouts);
  app.set('layout', 'layout');

  app.use(express.urlencoded({ extended: true }));
  app.use(express.json());
  app.use(cookieParser());
  app.use(express.static(path.join(__dirname, '..', 'public')));

  app.use(
    session({
      secret: process.env.SESSION_SECRET || 'change-me',
      resave: false,
      saveUninitialized: false,
      cookie: {
        maxAge: 120 * 60 * 1000, // matches SESSION_LIFETIME=120 (minutes) in the old .env
        secure: process.env.NODE_ENV === 'production',
      },
      // NOTE: default MemoryStore is dev-only and leaks memory / won't scale
      // past one process. Swap in connect-session-sequelize (backed by the
      // same DB) or connect-redis before deploying, the way Laravel's
      // SESSION_DRIVER=file/redis config would.
    })
  );

  app.use(loadCurrentUser(User));
  app.use(loadTenantContext(Branch));
  app.use((req, res, next) => {
    res.locals.currentPath = req.path;
    next();
  });

  app.use('/', webRoutes);

  app.use((req, res) => {
    res.status(404).send('Not found');
  });

  // eslint-disable-next-line no-unused-vars
  app.use((err, req, res, next) => {
    console.error(err);
    res.status(500).send('Internal server error');
  });

  return app;
}

module.exports = createApp;
