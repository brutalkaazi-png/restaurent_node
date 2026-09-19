const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/InventoryTransaction.php - one row per stock
// movement (initial stock, manual stock-in, or stock-out/usage).
const InventoryTransaction = sequelize.define(
  'InventoryTransaction',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    inventory_item_id: DataTypes.BIGINT.UNSIGNED,
    user_id: DataTypes.BIGINT.UNSIGNED,
    type: DataTypes.ENUM('in', 'out'),
    quantity: DataTypes.DECIMAL(10, 2),
    price_per_unit: DataTypes.DECIMAL(10, 2),
    notes: DataTypes.TEXT,
  },
  { tableName: 'inventory_transactions' }
);

module.exports = InventoryTransaction;
