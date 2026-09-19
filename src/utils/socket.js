const { Server } = require('socket.io');

let io = null;

// Called once from server.js after the HTTP server is created.
function init(httpServer) {
  io = new Server(httpServer, {
    cors: { origin: '*' }, // tighten this to your real origin(s) before deploying
  });

  io.on('connection', (socket) => {
    // Kitchen/bar/counter screens (and, in future, the customer table-status
    // page) join a room per restaurant so updates only go to that
    // restaurant's staff - mirrors the Pusher private channel
    // `restaurant.{id}` from the original app's (unused-by-any-view, but
    // present) App\Events\NewOrderPlaced.
    socket.on('join-restaurant', (restaurantId) => {
      socket.join(`restaurant-${restaurantId}`);
    });
    socket.on('leave-restaurant', (restaurantId) => {
      socket.leave(`restaurant-${restaurantId}`);
    });
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.IO has not been initialized yet - call init(httpServer) from server.js first.');
  }
  return io;
}

module.exports = { init, getIO };
