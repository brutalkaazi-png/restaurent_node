const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/RestaurantTable.php + all restaurant_tables migrations
const RestaurantTable = sequelize.define(
  'RestaurantTable',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    table_name: DataTypes.STRING,
    table_slug: DataTypes.STRING,
    status: DataTypes.STRING, // available|occupied|preparing|ordered|served|billing|bill_requested|pending_approval|confirmed
    table_token: DataTypes.STRING,
    is_virtual: { type: DataTypes.BOOLEAN, defaultValue: false },
    owner_session_id: DataTypes.STRING,
  },
  { tableName: 'restaurant_tables' }
);

module.exports = RestaurantTable;
