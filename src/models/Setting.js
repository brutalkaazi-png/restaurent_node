const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Setting = sequelize.define(
  'Setting',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    option_name: DataTypes.STRING,
    option_value: DataTypes.STRING,
    del_status: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'settings' }
);

module.exports = Setting;
