const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Recipe / Bill of Materials (BOM) connecting menu items to raw inventory ingredients
const RecipeItem = sequelize.define(
  'RecipeItem',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    item_variant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: true },
    inventory_item_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    quantity: { type: DataTypes.DECIMAL(10, 3), allowNull: false, defaultValue: 1 },
    unit: { type: DataTypes.STRING, allowNull: true },
  },
  { tableName: 'recipe_items' }
);

module.exports = RecipeItem;