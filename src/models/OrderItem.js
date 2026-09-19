const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/OrderItem.php
const OrderItem = sequelize.define(
  'OrderItem',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    order_id: DataTypes.BIGINT.UNSIGNED,
    item_id: DataTypes.BIGINT.UNSIGNED,
    item_variant_id: DataTypes.BIGINT.UNSIGNED,
    variant_name: DataTypes.STRING,
    original_price: DataTypes.DECIMAL(10, 2),
    price: DataTypes.FLOAT,
    discount_percentage: DataTypes.DECIMAL(10, 2),
    qty: DataTypes.INTEGER,
    total: DataTypes.FLOAT,
    remarks: DataTypes.TEXT,
    toppings: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  { tableName: 'order_items' }
);

module.exports = OrderItem;
