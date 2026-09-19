require('dotenv').config();
const http = require('http');

const { sequelize } = require('./src/models');
const createApp = require('./src/app');
const socket = require('./src/utils/socket');

const app = createApp();
const httpServer = http.createServer(app);
socket.init(httpServer);

const PORT = process.env.PORT || 3000;

sequelize
  .authenticate()
  .then(() => {
    console.log('Database connection established.');
    httpServer.listen(PORT, () => console.log(`Server (with Socket.IO) running on http://localhost:${PORT}`));
  })
  .catch((err) => {
    console.error('Unable to connect to the database:', err.message);
    process.exit(1);
  });
