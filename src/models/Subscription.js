const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Minimal stub - extend when the SuperAdmin subscriptions module is ported.
const Subscription = sequelize.define(
  'Subscription',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: DataTypes.STRING,
    subscription_type: DataTypes.STRING,
    month: DataTypes.STRING,
    cost: DataTypes.STRING,
    image: DataTypes.STRING,
    del_status: { type: DataTypes.INTEGER, defaultValue: 0 },
  },
  { tableName: 'subscriptions' }
);

module.exports = Subscription;
