const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/Order.php + all orders migrations
const Order = sequelize.define(
  'Order',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.BIGINT.UNSIGNED,
    res_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    table_id: DataTypes.BIGINT.UNSIGNED,
    name: DataTypes.STRING,
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    address: DataTypes.STRING,
    total_cost: DataTypes.FLOAT,
    payment_mode: DataTypes.STRING,
    transaction_id: DataTypes.STRING,
    delivery_charge: DataTypes.FLOAT,
    delivery_type: DataTypes.STRING,
    qr_type: DataTypes.STRING,
    source: DataTypes.STRING,
    order_status: DataTypes.STRING,
    discount: DataTypes.FLOAT,
    time: DataTypes.STRING,
  },
  { tableName: 'orders' }
);

module.exports = Order;
