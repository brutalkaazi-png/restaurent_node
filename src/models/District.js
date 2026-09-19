const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const District = sequelize.define(
  'District',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: DataTypes.STRING,
  },
  { tableName: 'districts' }
);

module.exports = District;
