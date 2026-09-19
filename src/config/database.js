const { Sequelize } = require('sequelize');
require('dotenv').config();

// Mirrors the old config/database.php "mysql" connection.
const sequelize = new Sequelize(
  process.env.DB_DATABASE || 'restaurant_jp',
  process.env.DB_USERNAME || 'root',
  process.env.DB_PASSWORD || '',
  {
    host: process.env.DB_HOST || '127.0.0.1',
    port: process.env.DB_PORT || 3306,
    dialect: 'mysql',
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: {
      // Laravel migrations use snake_case columns + created_at/updated_at
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  }
);

module.exports = sequelize;
