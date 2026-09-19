const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/User.php and database/migrations/*_users_table*.php
// user_type: 'S' super admin, 'R' restaurant owner, 'K' kitchen admin, 'Co' counter admin
// user_role: e.g. 'waiter'
const User = sequelize.define(
  'User',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    name: DataTypes.STRING,
    slug: DataTypes.STRING,
    email: { type: DataTypes.STRING, unique: true, allowNull: false },
    address: DataTypes.STRING,
    otp: DataTypes.STRING,
    city: DataTypes.STRING,
    location: DataTypes.STRING,
    latlng: DataTypes.STRING,
    phone: DataTypes.STRING,
    user_type: DataTypes.STRING,
    user_role: DataTypes.STRING,
    waiter_id: DataTypes.BIGINT.UNSIGNED,
    image: DataTypes.STRING,
    logo: DataTypes.STRING,
    restaurant_type: DataTypes.STRING,
    remark: DataTypes.TEXT,
    email_verified_at: DataTypes.DATE,
    password: { type: DataTypes.STRING, allowNull: false },
    status: DataTypes.STRING, // 'pending' | 'approved'
    del_status: { type: DataTypes.INTEGER, defaultValue: 0 },
    delivery_charge: { type: DataTypes.INTEGER, defaultValue: 0 },
    is_deliver: { type: DataTypes.INTEGER, defaultValue: 0 },
    card_payment: { type: DataTypes.INTEGER, defaultValue: 0 },
    secret_key: DataTypes.STRING, // Stripe secret key (per restaurant)
    public_key: DataTypes.STRING,
    pay_first: { type: DataTypes.BOOLEAN, defaultValue: false },
    counter_auto_clear: { type: DataTypes.BOOLEAN, defaultValue: false },
    visiting_card_color: DataTypes.STRING,
    visiting_card_title_color: DataTypes.STRING,
    visiting_card_info_color: DataTypes.STRING,
    theme_primary_color: DataTypes.STRING,
    theme_secondary_color: DataTypes.STRING,
    theme_heading_text_color: DataTypes.STRING,
    theme_background_color: DataTypes.STRING,
    theme_outer_background_color: DataTypes.STRING,
    theme_accent_color: DataTypes.STRING,
    remember_token: DataTypes.STRING,
  },
  {
    tableName: 'users',
  }
);

module.exports = User;
