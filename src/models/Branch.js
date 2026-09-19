const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Branch = sequelize.define(
  'Branch',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    name: { type: DataTypes.STRING, allowNull: false },
    slug: { type: DataTypes.STRING, allowNull: false },
    is_active: { type: DataTypes.BOOLEAN, defaultValue: true },
  },
  { tableName: 'branches' }
);

module.exports = Branch;
