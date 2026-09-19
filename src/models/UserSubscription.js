const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Minimal port - covers what TableMenuController reads to gate menu access
// behind an active subscription. Extend with billing columns as you port
// the SuperAdmin subscriptions module.
const UserSubscription = sequelize.define(
  'UserSubscription',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.BIGINT.UNSIGNED,
    subscription_id: DataTypes.BIGINT.UNSIGNED,
    payment_status: DataTypes.STRING,
    subscription_status: DataTypes.STRING,
    subscription_start_date: DataTypes.DATE,
    subscription_end_date: DataTypes.DATE,
  },
  { tableName: 'user_subscriptions' }
);

module.exports = UserSubscription;
