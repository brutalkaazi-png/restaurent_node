const express = require('express');
const router = express.Router();

const authController = require('../controllers/authController');
const registerController = require('../controllers/registerController');
const tableMenuController = require('../controllers/tableMenuController');
const counterController = require('../controllers/counterController');
const categoryController = require('../controllers/categoryController');
const menuController = require('../controllers/menuController');
const restaurantTableController = require('../controllers/restaurantTableController');
const waiterController = require('../controllers/waiterController');
const reservationController = require('../controllers/reservationController');
const customerController = require('../controllers/customerController');
const discountController = require('../controllers/discountController');
const promotionController = require('../controllers/promotionController');
const offerController = require('../controllers/offerController');
const inventoryController = require('../controllers/inventoryController');
const inventoryReportController = require('../controllers/inventoryReportController');
const { createOrderReportController } = require('../controllers/orderReportController');
const orderSummaryController = require('../controllers/orderSummaryController');
const dashboardController = require('../controllers/dashboardController');
const staffCallController = require('../controllers/staffCallController');

const onlineOrderReportController = createOrderReportController('Order Online QR', 'res/order-report');
const tableOrderReportController = createOrderReportController('Table Based QR', 'res/table-order-summary');
const superAdminDashboardController = require('../controllers/superAdminDashboardController');
const superAdminRestaurantController = require('../controllers/superAdminRestaurantController');
const settingController = require('../controllers/settingController');
const subscriptionPlanController = require('../controllers/subscriptionPlanController');
const homeController = require('../controllers/homeController');
const checkoutController = require('../controllers/checkoutController');
const customerOrderController = require('../controllers/customerOrderController');
const { createStationController } = require('../controllers/stationController');
const { uploadImage } = require('../utils/mediaHelper');
const {
  ensureGuest,
  ensureAuth,
  requireKitchenAdmin,
  requireCounterAdmin,
  requireRestaurantOwner,
  requireSuperAdmin,
} = require('../middleware/auth');

const kitchenController = createStationController('kitchen');
const barController = createStationController('bar');

/* ---------------------------------------------------------------------- *
 * Ported from routes/web.php. Only the auth block and the dine-in
 * ordering ("TableMenuController") block are wired up in this pass - the
 * superadmin/, kitchen-admin/, counter-admin/ route groups and everything
 * else under the ['auth','res'] group are still TODO (see README).
 * ---------------------------------------------------------------------- */

// Auth::routes() equivalent (just the pieces this app actually uses)
router.get('/login', ensureGuest, authController.showLogin);
router.post('/login', ensureGuest, authController.login);
router.get('/logout', authController.logout);
router.get('/signout', authController.signout);

router.get('/register', registerController.showRegister);
router.get('/user-register', registerController.showRegister);
router.post('/register/store', registerController.storeRegister);
router.get('/otp/:id', authController.showOtp);
router.post('/otp-store', authController.verifyOtp);

// TODO: GoogleLoginController / FaceBookController (Socialite) - port once
// you're ready to wire up OAuth client ids/secrets.

// PUBLIC ONLINE ORDERING (delivery/pickup) - ported from HomeController.php /
// CheckoutController.php / OrderController.php. Distinct from the table QR
// ordering flow above: this uses a plain session cart, not DB TableCustomer rows.
router.get('/get-variants/:item', homeController.getVariants);
router.get('/get-toppings/:item', homeController.getToppings);
router.post('/add-to-cart', homeController.addToCart);
router.get('/get-cart', homeController.getCart);
router.get('/thank-you', homeController.thankyou);
router.get('/delete_order/:id', homeController.deleteOrder);
router.get('/:slug/menu', homeController.showMenu);

router.get('/:slug/offer', offerController.index);
router.get('/:slug/offer/:promotionslug', offerController.show);

router.get('/checkout', checkoutController.index);
router.post('/store_order', checkoutController.store);
router.post('/login/store', checkoutController.login);

router.get('/order/:id', customerOrderController.show);

router.get('/table-qrcode/:id', restaurantTableController.renderPublicQr);

// Public dine-in QR ordering flow
router.get('/:slug/menu/:table_slug', tableMenuController.showTableMenu);
router.post('/add-table-menu', tableMenuController.addTableMenu);
router.get('/get-tablecart', tableMenuController.getTableCart);
router.post('/tablecart/store', tableMenuController.storeOrder);
router.post('/verify-table-token', tableMenuController.verifyTableToken);
router.get('/make_my_bill/:id', tableMenuController.makeBill);
router.get('/table-order/delete/:id', tableMenuController.deleteTableOrderItem);
router.post('/table-menu/start-over/:id', tableMenuController.startOver);
router.post('/request-bill/:id', tableMenuController.requestBill);
router.post('/staff-call/:tableId', staffCallController.create);
router.get('/bill-requested/:id', tableMenuController.showBillRequestedPage);
router.get('/table-status/:id', tableMenuController.getTableStatus);
router.post('/table-menu/confirm-and-pay/:id', tableMenuController.confirmAndPay);
router.post('/table-menu/create-payment-intent', tableMenuController.createTablePaymentIntent);
router.post('/table-menu/complete-paid-order', tableMenuController.completePaidOrder);

// KITCHEN STAFF ROUTES - ported from the 'kitchen-admin' route group
const kitchenAdmin = express.Router();
kitchenAdmin.use(ensureAuth, requireKitchenAdmin);
kitchenAdmin.get('/kitchen', kitchenController.index);
kitchenAdmin.get('/kitchen/update-order/:id', kitchenController.updateOrder);
kitchenAdmin.post('/kitchen/toggle-sold-out/:id', kitchenController.toggleItemSoldOut);
kitchenAdmin.get('/kitchen/history-by-date', kitchenController.fetchHistoryByDate);
kitchenAdmin.get('/kitchen/fetch-time-wise', kitchenController.fetchTimeWiseView);
kitchenAdmin.get('/kitchen/fetch-table-wise', kitchenController.fetchTableWiseView);
kitchenAdmin.get('/kitchen/fetch-item-wise', kitchenController.fetchItemWiseView);
kitchenAdmin.post('/kitchen/update-items-status', kitchenController.updateItemsStatus);
kitchenAdmin.get('/order-counts', kitchenController.getOrderCounts);

kitchenAdmin.get('/bar', barController.index);
kitchenAdmin.get('/update-order/:id', barController.updateOrder);
kitchenAdmin.post('/toggle-sold-out/:id', barController.toggleItemSoldOut);
kitchenAdmin.get('/history-by-date', barController.fetchHistoryByDate);
kitchenAdmin.get('/fetch-time-wise', barController.fetchTimeWiseView);
kitchenAdmin.get('/fetch-table-wise', barController.fetchTableWiseView);
kitchenAdmin.get('/fetch-item-wise', barController.fetchItemWiseView);
kitchenAdmin.post('/update-items-status', barController.updateItemsStatus);
router.use('/kitchen-admin', kitchenAdmin);

// COUNTER STAFF ROUTES - ported from the 'counter-admin' route group
const counterAdmin = express.Router();
counterAdmin.use(ensureAuth, requireCounterAdmin);
counterAdmin.get('/:slug/counter', counterController.index);
counterAdmin.get('/get_table_updates/:id', counterController.getTableUpdates);
counterAdmin.get('/get_table_orders/:id', counterController.getTableOrders);
counterAdmin.post('/update-order', counterController.updateOrder);
counterAdmin.get('/make_bill/:id', counterController.makeBill);
counterAdmin.post('/complete_order/:id', counterController.completeOrder);
counterAdmin.get('/cancel_order/:id', counterController.cancelOrder);
counterAdmin.get('/get-online-orders/:id', counterController.getOnlineOrders);
counterAdmin.post('/approve-order/:orderId', counterController.approveOrder);
counterAdmin.post('/decline-order/:orderId', counterController.declineOrder);
counterAdmin.post('/approve-table-order/:tableId', counterController.approveTableOrder);
counterAdmin.post('/update-counter-settings', counterController.updateCounterSettings);
counterAdmin.post('/undo-bill-request/:id', counterController.undoBillRequest);
counterAdmin.get('/table-qr/:id', restaurantTableController.getQrData);
counterAdmin.get('/table-qr-download/:id', restaurantTableController.downloadQr);
router.use('/counter-admin', counterAdmin);

// CASHIER (stub landing page - CashierController.php was a one-liner in the original too)
router.get('/cashier', ensureAuth, (req, res) => res.render('cashier/index'));

// PLATFORM-LEVEL SUPERADMIN ROUTES - ported from the ['auth','superadmin']
// prefix('superadmin') group. Only the dashboard, restaurant approval/CRUD,
// platform settings, and subscription-plan CRUD are ported in this pass -
// see README for what's still missing (billing integration, reports,
// admin sub-user management, discounts/promotions/inventory).
const superAdmin = express.Router();
superAdmin.use(ensureAuth, requireSuperAdmin);

superAdmin.get('/dashboard', superAdminDashboardController.index);

superAdmin.get('/restaurants', superAdminRestaurantController.index);
superAdmin.post('/restaurant-change-status', superAdminRestaurantController.storeStatus);
superAdmin.get('/view-subscription/:id', superAdminRestaurantController.viewSubscription);
superAdmin.get('/view-order-detail/:id', superAdminRestaurantController.viewOrderDetail);
superAdmin.get('/restaurant/edit/:id', superAdminRestaurantController.edit);
superAdmin.post(
  '/restaurant/update/:id',
  uploadImage('images').fields([{ name: 'image', maxCount: 1 }, { name: 'logo', maxCount: 1 }]),
  superAdminRestaurantController.update
);
superAdmin.post('/restaurant/delete/:id', superAdminRestaurantController.destroy);

superAdmin.get('/setting', settingController.index);
superAdmin.get('/setting/create', settingController.create);
superAdmin.post('/setting/store', settingController.store);
superAdmin.get('/setting/:id/edit', settingController.edit);
superAdmin.post('/setting/:id', settingController.update);
superAdmin.post('/setting/:id/delete', settingController.destroy);

superAdmin.get('/subscriptions', subscriptionPlanController.index);
superAdmin.get('/subscriptions/create', subscriptionPlanController.create);
superAdmin.get('/subscriptions/:id/edit', subscriptionPlanController.edit);
superAdmin.post('/subscriptions', uploadImage('images').single('image'), subscriptionPlanController.store);
superAdmin.post('/subscriptions/:id/delete', subscriptionPlanController.destroy);

router.use('/superadmin', superAdmin);

// RESTAURANT OWNER ROUTES - ported from the ['auth','res','subscription.check'] group.
// (subscription.check isn't ported - see README)
const resOwner = express.Router();
resOwner.use(ensureAuth, requireRestaurantOwner);

resOwner.get('/dashboard', dashboardController.index);
resOwner.get('/staff-calls', staffCallController.index);
resOwner.post('/staff-calls/:id/resolve', staffCallController.resolve);
resOwner.get('/staff-calls/pending-count', staffCallController.countPending);

resOwner.get('/categories', categoryController.index);
resOwner.get('/categories/create', categoryController.create);
resOwner.get('/categories/:id/edit', categoryController.edit);
resOwner.post('/categories', uploadImage('images').single('category_image'), categoryController.store);
resOwner.post('/categories/:id/delete', categoryController.destroy);
resOwner.post('/category/update-order', categoryController.storeOrder);

resOwner.get('/menus', menuController.index);
resOwner.get('/menus/create', menuController.create);
resOwner.get('/menus/:id/edit', menuController.edit);
resOwner.post('/menus', uploadImage('images').single('item_image'), menuController.store);
resOwner.post('/menus/:id/delete', menuController.destroy);
resOwner.post('/menus/:id/toggle-sold-out', menuController.toggleSoldOut);
resOwner.post('/menu/update-order', menuController.storeOrder);

resOwner.get('/tables', restaurantTableController.index);
resOwner.get('/tables/create', restaurantTableController.create);
resOwner.get('/tables/:id/edit', restaurantTableController.edit);
resOwner.post('/tables', restaurantTableController.store);
resOwner.post('/tables/:id/delete', restaurantTableController.destroy);
resOwner.get('/tables/:id/qr-data', restaurantTableController.getQrData);
resOwner.get('/tables/:id/qr-download', restaurantTableController.downloadQr);

resOwner.get('/reservations', reservationController.index);
resOwner.get('/reservations/create', reservationController.create);
resOwner.get('/reservations/:id/edit', reservationController.edit);
resOwner.post('/reservations', reservationController.store);
resOwner.post('/reservations/:id/status', reservationController.updateStatus);
resOwner.post('/reservations/:id/delete', reservationController.destroy);

resOwner.get('/customers', customerController.index);
resOwner.get('/customers/:id/edit', customerController.edit);
resOwner.post('/customers/:id', customerController.update);
resOwner.get('/customers/:id/history', customerController.history);

resOwner.get('/waiters', waiterController.index);
resOwner.get('/waiters/create', waiterController.create);
resOwner.get('/waiters/:id/edit', waiterController.edit);
resOwner.post('/waiters', waiterController.store);
resOwner.post('/waiters/:id', waiterController.update);
resOwner.post('/waiters/:id/delete', waiterController.destroy);

resOwner.get('/discounts', discountController.index);
resOwner.get('/discounts/create', discountController.create);
resOwner.get('/discounts/:id/edit', discountController.edit);
resOwner.post('/discounts', discountController.store);
resOwner.post('/discounts/:id', discountController.update);
resOwner.post('/discounts/:id/delete', discountController.destroy);

resOwner.get('/promotions', promotionController.index);
resOwner.get('/promotions/create', promotionController.create);
resOwner.get('/promotions/:id/edit', promotionController.edit);
resOwner.post('/promotions', promotionController.store);
resOwner.post('/promotions/:id/delete', promotionController.destroy);

resOwner.get('/inventory', inventoryController.index);
resOwner.get('/inventory/create', inventoryController.create);
resOwner.post('/inventory', inventoryController.store);
resOwner.get('/inventory/:id/edit', inventoryController.edit);
resOwner.post('/inventory/:id', inventoryController.update);
resOwner.post('/inventory/:id/delete', inventoryController.destroy);
resOwner.get('/inventory/:id/stock-in', inventoryController.showStockInForm);
resOwner.post('/inventory/:id/stock-in', inventoryController.stockIn);
resOwner.get('/inventory/:id/stock-out', inventoryController.showStockOutForm);
resOwner.post('/inventory/:id/stock-out', inventoryController.stockOut);
resOwner.get('/inventory/:id/history', inventoryController.history);
resOwner.get('/inventory-report', inventoryReportController.index);

resOwner.get('/order-report', onlineOrderReportController.index);
resOwner.get('/order-report/view/:id', onlineOrderReportController.view);
resOwner.get('/table-order-by-items', tableOrderReportController.index);
resOwner.get('/table-order-by-items/view/:id', tableOrderReportController.view);
resOwner.get('/order-summary', orderSummaryController.index);

// Route the root path based on user auth role or to login
router.get('/', (req, res) => {
  if (req.session && req.session.userId && req.currentUser) {
    if (req.currentUser.user_type === 'S') return res.redirect('/superadmin/dashboard');
    if (req.currentUser.user_type === 'R' && req.currentUser.user_role !== 'waiter') return res.redirect('/dashboard');
    if (req.currentUser.user_type === 'K') return res.redirect('/kitchen-admin/kitchen');
    if (req.currentUser.user_type === 'Co') return res.redirect(`/counter-admin/${req.currentUser.slug}/counter`);
    return res.redirect('/home');
  }
  return res.redirect('/login');
});

// Keep the shared authenticated landing page ahead of the owner router below;
// resOwner applies requireRestaurantOwner to every path mounted at '/'.
router.get('/home', ensureAuth, (req, res) => res.send(`Logged in as user #${req.session.userId}`));

router.use('/', resOwner);

module.exports = router;
