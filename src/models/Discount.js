const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/Discount.php - a time-window + day-of-week
// discount rule (e.g. "20% off 3pm-5pm on Mon/Tue/Wed") applied to a set
// of items via the discount_items pivot table.
const Discount = sequelize.define(
  'Discount',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    start_time: DataTypes.STRING, // stored/compared as "HH:mm:ss", matching Laravel's TIME column
    end_time: DataTypes.STRING,
    discount_percentage: DataTypes.DECIMAL(5, 2),
    days: {
      type: DataTypes.JSON, // array of day names, e.g. ["Monday","Tuesday"] - matches Laravel's whereJsonContains('days', ...)
      allowNull: false,
    },
  },
  { tableName: 'discounts' }
);

module.exports = Discount;
