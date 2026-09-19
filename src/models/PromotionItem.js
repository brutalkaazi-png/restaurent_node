const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/PromotionItem.php
const PromotionItem = sequelize.define(
  'PromotionItem',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    promotion_id: DataTypes.BIGINT.UNSIGNED,
    item_id: DataTypes.BIGINT.UNSIGNED,
    offer_price: DataTypes.STRING, // matches the original's string column (not decimal)
  },
  { tableName: 'promotion_items' }
);

module.exports = PromotionItem;
