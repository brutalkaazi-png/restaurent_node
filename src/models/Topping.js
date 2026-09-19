const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/Topping.php
const Topping = sequelize.define(
  'Topping',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    item_id: DataTypes.BIGINT.UNSIGNED,
    name: DataTypes.STRING,
    price: DataTypes.DECIMAL(8, 2),
  },
  { tableName: 'toppings' }
);

module.exports = Topping;
