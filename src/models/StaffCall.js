const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const StaffCall = sequelize.define(
  'StaffCall',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    table_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    type: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'general' },
    status: { type: DataTypes.STRING(50), allowNull: false, defaultValue: 'pending' },
    resolved_at: DataTypes.DATE,
  },
  { tableName: 'staff_calls' }
);

module.exports = StaffCall;