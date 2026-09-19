const { getIO } = require('./socket');

// Replaces app/Events/NewOrderPlaced.php's Pusher broadcast. In the
// original Laravel app this event existed but nothing in the Blade views
// actually subscribed to it (grep of resources/views turns up no
// `Echo.channel(...).listen(...)` at all) - so this is a case where the
// Express port goes slightly *beyond* strict parity: kitchen/bar/counter
// screens here actually listen and refresh live, since polling-only felt
// like a regression worth fixing rather than faithfully reproducing.
//
// Room naming matches the original's channel naming (`restaurant.{id}` ->
// `restaurant-{id}`) so it's a drop-in swap for real Pusher later if you
// want cross-server delivery instead of this single-process Socket.IO
// setup (same caveat as src/utils/cacheStore.js - fine for one process,
// swap to a shared broker before scaling horizontally).
function notifyRestaurant(restaurantId, payload = {}) {
  try {
    getIO()
      .to(`restaurant-${restaurantId}`)
      .emit('restaurant-update', { restaurantId, at: new Date().toISOString(), ...payload });
  } catch (e) {
    // Socket.IO not initialized (e.g. running a script/test outside
    // server.js) - degrade silently rather than crash the request.
    // eslint-disable-next-line no-console
    console.log(`[event] restaurant-update restaurant_id=${restaurantId} (socket.io not active)`);
  }
}

// Kept as the original name used throughout the ordering/counter/kitchen
// controllers - a new order or an order-status change both just mean
// "this restaurant's screens should refresh".
function newOrderPlaced(restaurantId) {
  notifyRestaurant(restaurantId, { reason: 'order' });
}

module.exports = { newOrderPlaced, notifyRestaurant };
