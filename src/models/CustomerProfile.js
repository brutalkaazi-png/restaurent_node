const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const CustomerProfile = sequelize.define(
  'CustomerProfile',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    customer_user_id: DataTypes.BIGINT.UNSIGNED,
    name: { type: DataTypes.STRING, allowNull: false },
    email: DataTypes.STRING,
    phone: DataTypes.STRING,
    address: DataTypes.STRING,
    notes: DataTypes.TEXT,
    loyalty_points: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    visit_count: { type: DataTypes.INTEGER, allowNull: false, defaultValue: 0 },
    total_spend: { type: DataTypes.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
  },
  { tableName: 'customer_profiles' }
);

module.exports = CustomerProfile;
