const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/Promotion.php - a named, publicly-shareable
// promo page (distinct from Discount: a Discount silently changes an
// item's price on the regular menu; a Promotion is its own dedicated
// "offer" page at /{slug}/offer/{promotion-slug}, gated behind the
// restaurant having an active subscription).
const Promotion = sequelize.define(
  'Promotion',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    name: DataTypes.STRING,
    slug: DataTypes.STRING,
    start_date: DataTypes.DATEONLY,
    end_date: DataTypes.DATEONLY,
    start_time: DataTypes.STRING, // "HH:mm:ss", nullable ("All Time" when absent)
    end_time: DataTypes.STRING,
    is_active: { type: DataTypes.STRING, defaultValue: 'active' }, // original uses the literal strings 'Active'/'Inactive'
    days: {
      type: DataTypes.JSON, // array of day names, or ["All Day"]
      allowNull: false,
    },
  },
  { tableName: 'promotions' }
);

module.exports = Promotion;
