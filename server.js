require('dotenv').config();
const http = require('http');

const { sequelize } = require('./src/models');
const createApp = require('./src/app');
const socket = require('./src/utils/socket');
const { seedDatabaseIfNeeded } = require('./src/utils/seedData');

const app = createApp();
const httpServer = http.createServer(app);
socket.init(httpServer);

const PORT = 3000;
const HOST = '0.0.0.0';

async function start() {
  try {
    await sequelize.authenticate();
    console.log('Database connection established.');
    await sequelize.sync();
    console.log('Database schema synchronized.');
    await seedDatabaseIfNeeded();
    console.log('Demo seed checked.');
  } catch (err) {
    console.error('Database initialization notice:', err.message);
  }

  httpServer.listen(PORT, HOST, () => {
    console.log(`Server (with Socket.IO) running on http://${HOST}:${PORT}`);
  });
}

start();
