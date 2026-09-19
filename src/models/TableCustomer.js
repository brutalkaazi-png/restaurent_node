const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/TableCustomer.php. This is the "live cart / current
// order" table for dine-in ordering, one row per item line while it's
// pending, confirmed, in the kitchen, or being billed.
const TableCustomer = sequelize.define(
  'TableCustomer',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_id: DataTypes.BIGINT.UNSIGNED,
    item_id: DataTypes.BIGINT.UNSIGNED,
    item_variant_id: DataTypes.BIGINT.UNSIGNED,
    quantity: DataTypes.INTEGER,
    price: DataTypes.STRING, // matches Laravel migration (string column, not float)
    status: DataTypes.STRING, // add_to_cart|confirmed|order_food|order_drink|preparing|order_delivered|billing|pending_approval|payment_pending|cancelled
    payment_mode: DataTypes.STRING,
    time: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    session_id: DataTypes.STRING,
    waiter_id: DataTypes.BIGINT.UNSIGNED,
    toppings: {
      type: DataTypes.JSON,
      allowNull: true,
    },
  },
  { tableName: 'table_customers' }
);

module.exports = TableCustomer;
