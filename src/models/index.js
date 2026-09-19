const sequelize = require('../config/database');

const User = require('./User');
const Category = require('./Category');
const Item = require('./Item');
const ItemVariant = require('./ItemVariant');
const Topping = require('./Topping');
const RestaurantTable = require('./RestaurantTable');
const Branch = require('./Branch');
const Reservation = require('./Reservation');
const CustomerProfile = require('./CustomerProfile');
const TableCustomer = require('./TableCustomer');
const TableCustomersPreorder = require('./TableCustomersPreorder');
const Order = require('./Order');
const OrderItem = require('./OrderItem');
const District = require('./District');
const Setting = require('./Setting');
const MenuTemplate = require('./MenuTemplate');
const Subscription = require('./Subscription');
const UserSubscription = require('./UserSubscription');
const Discount = require('./Discount');
const Promotion = require('./Promotion');
const PromotionItem = require('./PromotionItem');
const InventoryItem = require('./InventoryItem');
const InventoryTransaction = require('./InventoryTransaction');
const StaffCall = require('./StaffCall');

/* ---------------------------------------------------------------------- *
 * Associations - each block below mirrors one Eloquent relationship from
 * the original app/Models/*.php files.
 * ---------------------------------------------------------------------- */

// User.php
User.hasMany(Item, { foreignKey: 'user_id', as: 'items' });
User.hasMany(RestaurantTable, { foreignKey: 'restaurant_id', as: 'restaurant_tables' });
User.hasMany(Branch, { foreignKey: 'restaurant_id', as: 'branches' });
User.hasMany(Order, { foreignKey: 'user_id', as: 'orders' });
User.hasMany(Order, { foreignKey: 'res_id', as: 'restaurant_orders' });
User.hasMany(UserSubscription, { foreignKey: 'user_id', as: 'user_subscriptions' });
User.hasMany(User, { foreignKey: 'waiter_id', as: 'waiters' }); // waiters() -> other users with waiter_id = this user's id
User.belongsTo(User, { foreignKey: 'waiter_id', as: 'restaurant' }); // restaurant() -> the owner this waiter belongs to

// Category.php
Branch.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
User.hasMany(Branch, { foreignKey: 'restaurant_id', as: 'restaurant_branches' });
Branch.hasMany(RestaurantTable, { foreignKey: 'branch_id', as: 'tables' });
RestaurantTable.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Reservation.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
Reservation.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
Reservation.belongsTo(RestaurantTable, { foreignKey: 'table_id', as: 'table' });
RestaurantTable.hasMany(Reservation, { foreignKey: 'table_id', as: 'reservations' });
CustomerProfile.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
CustomerProfile.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
CustomerProfile.belongsTo(User, { foreignKey: 'customer_user_id', as: 'customer' });

Category.hasMany(Item, { foreignKey: 'item_category', as: 'items' });

// Item.php
Item.belongsTo(Category, { foreignKey: 'item_category', as: 'category' });
Item.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Item.hasMany(OrderItem, { foreignKey: 'item_id', as: 'order_items' });
Item.hasMany(TableCustomer, { foreignKey: 'item_id', as: 'table_customer' });
Item.hasMany(ItemVariant, { foreignKey: 'item_id', as: 'variants' });
Item.hasMany(Topping, { foreignKey: 'item_id', as: 'toppings' });

// ItemVariant.php / Topping.php
ItemVariant.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
Topping.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// RestaurantTable.php
RestaurantTable.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
StaffCall.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
StaffCall.belongsTo(Branch, { foreignKey: 'branch_id', as: 'branch' });
StaffCall.belongsTo(RestaurantTable, { foreignKey: 'table_id', as: 'table' });

// TableCustomer.php
TableCustomer.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
TableCustomer.belongsTo(RestaurantTable, { foreignKey: 'table_id', as: 'table' });
TableCustomer.belongsTo(ItemVariant, { foreignKey: 'item_variant_id', as: 'variant' });

// TableCustomersPreorder.php
TableCustomersPreorder.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
TableCustomersPreorder.belongsTo(RestaurantTable, { foreignKey: 'table_id', as: 'table' });
TableCustomersPreorder.belongsTo(ItemVariant, { foreignKey: 'item_variant_id', as: 'variant' });

// Order.php
Order.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
Order.belongsTo(User, { foreignKey: 'res_id', as: 'restaurant' });
Order.hasMany(OrderItem, { foreignKey: 'order_id', as: 'order_items' });
Order.belongsTo(RestaurantTable, { foreignKey: 'table_id', as: 'table' });

// OrderItem.php
OrderItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });
OrderItem.belongsTo(Order, { foreignKey: 'order_id', as: 'order' });
OrderItem.belongsTo(ItemVariant, { foreignKey: 'item_variant_id', as: 'variant' });

// UserSubscription.php
UserSubscription.belongsTo(Subscription, { foreignKey: 'subscription_id', as: 'subscription' });
UserSubscription.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// MenuTemplate.php
MenuTemplate.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

// Discount.php - many-to-many with Item via the discount_items pivot table
Discount.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
Discount.belongsToMany(Item, { through: 'discount_items', foreignKey: 'discount_id', otherKey: 'item_id', as: 'items', timestamps: true });
Item.belongsToMany(Discount, { through: 'discount_items', foreignKey: 'item_id', otherKey: 'discount_id', as: 'discounts', timestamps: true });

// Ports Item::getActiveDiscount() - finds the best currently-active
// discount (by day-of-week + time-of-day window) for this item, if any.
Item.prototype.getActiveDiscount = async function () {
  const now = new Date();
  const days = ['Sunday', 'Monday', 'Tuesday', 'Wednesday', 'Thursday', 'Friday', 'Saturday'];
  const today = days[now.getDay()];
  const nowTime = now.toTimeString().slice(0, 8); // "HH:MM:SS"

  const { Op } = require('sequelize');
  const itemDiscounts = await this.getDiscounts({
    where: {
      start_time: { [Op.lte]: nowTime },
      end_time: { [Op.gte]: nowTime },
    },
    order: [['discount_percentage', 'DESC']],
  });
  return itemDiscounts.find((d) => Array.isArray(d.days) && d.days.includes(today)) || null;
};

// Promotion.php / PromotionItem.php
Promotion.belongsTo(User, { foreignKey: 'restaurant_id', as: 'restaurant' });
Promotion.hasMany(PromotionItem, { foreignKey: 'promotion_id', as: 'items' });
PromotionItem.belongsTo(Promotion, { foreignKey: 'promotion_id', as: 'promotion' });
PromotionItem.belongsTo(Item, { foreignKey: 'item_id', as: 'item' });

// InventoryItem.php / InventoryTransaction.php
InventoryItem.belongsTo(User, { foreignKey: 'user_id', as: 'user' });
InventoryItem.hasMany(InventoryTransaction, { foreignKey: 'inventory_item_id', as: 'transactions' });
InventoryTransaction.belongsTo(InventoryItem, { foreignKey: 'inventory_item_id', as: 'item' });
InventoryTransaction.belongsTo(User, { foreignKey: 'user_id', as: 'user' });

module.exports = {
  sequelize,
  User,
  Category,
  Item,
  ItemVariant,
  Topping,
  RestaurantTable,
  Branch,
  Reservation,
  CustomerProfile,
  TableCustomer,
  TableCustomersPreorder,
  Order,
  OrderItem,
  District,
  Setting,
  MenuTemplate,
  Subscription,
  UserSubscription,
  Discount,
  Promotion,
  PromotionItem,
  InventoryItem,
  InventoryTransaction,
  StaffCall,
};
