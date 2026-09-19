const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/InventoryItem.php
const InventoryItem = sequelize.define(
  'InventoryItem',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    name: DataTypes.STRING,
    unit: DataTypes.STRING,
    quantity: { type: DataTypes.DECIMAL(10, 2), defaultValue: 0 },
  },
  { tableName: 'inventory_items' }
);

module.exports = InventoryItem;
