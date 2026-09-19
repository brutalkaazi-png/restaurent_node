const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/Item.php
const Item = sequelize.define(
  'Item',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    item_name: DataTypes.STRING,
    item_slug: DataTypes.STRING,
    item_description: DataTypes.TEXT,
    item_category: DataTypes.BIGINT.UNSIGNED,
    price: DataTypes.DECIMAL(8, 2),
    is_drink: { type: DataTypes.BOOLEAN, defaultValue: false },
    sold_out: { type: DataTypes.BOOLEAN, defaultValue: false },
    has_variants: { type: DataTypes.BOOLEAN, defaultValue: false },
    has_toppings: { type: DataTypes.BOOLEAN, defaultValue: false },
    item_image: DataTypes.STRING,
    item_order: DataTypes.INTEGER,
  },
  { tableName: 'items' }
);

// Same discount logic as Item::getDiscountedPrice() / getActiveDiscount()
// Ports the price rounding to nearest 5 used on the Laravel side.
Item.prototype.getDiscountedPrice = function (discount) {
  if (!discount) return parseFloat(this.price);
  const price = parseFloat(this.price);
  const discountAmount = (price * discount.discount_percentage) / 100;
  const discountedPrice = price - discountAmount;
  return Math.round(discountedPrice / 5) * 5;
};

module.exports = Item;
