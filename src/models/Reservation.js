const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

const Reservation = sequelize.define(
  'Reservation',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    restaurant_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    branch_id: { type: DataTypes.BIGINT.UNSIGNED, allowNull: false },
    table_id: DataTypes.BIGINT.UNSIGNED,
    customer_name: { type: DataTypes.STRING, allowNull: false },
    customer_phone: DataTypes.STRING,
    customer_email: DataTypes.STRING,
    guest_count: { type: DataTypes.INTEGER, allowNull: false },
    starts_at: { type: DataTypes.DATE, allowNull: false },
    ends_at: { type: DataTypes.DATE, allowNull: false },
    notes: DataTypes.TEXT,
    status: { type: DataTypes.STRING, allowNull: false, defaultValue: 'pending' },
  },
  { tableName: 'reservations' }
);

module.exports = Reservation;
