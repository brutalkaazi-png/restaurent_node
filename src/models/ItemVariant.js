const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/ItemVariant.php
const ItemVariant = sequelize.define(
  'ItemVariant',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    item_id: DataTypes.BIGINT.UNSIGNED,
    name: DataTypes.STRING,
    price: DataTypes.DECIMAL(8, 2),
  },
  { tableName: 'item_variants' }
);

module.exports = ItemVariant;
