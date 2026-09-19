const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/Category.php
const Category = sequelize.define(
  'Category',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    category_name: DataTypes.STRING,
    category_description: DataTypes.TEXT,
    category_order: DataTypes.INTEGER,
    category_image: DataTypes.STRING, // actual Laravel column name (added via a later migration, not in the base create_categories_table)
  },
  { tableName: 'categories' }
);

module.exports = Category;
