const { Sequelize } = require('sequelize');
const path = require('path');
require('dotenv').config();

const isMysqlConfigured =
  process.env.DB_CONNECTION === 'mysql' &&
  Boolean(process.env.DB_HOST) &&
  process.env.DB_HOST !== '127.0.0.1' &&
  process.env.DB_HOST !== 'localhost';

let sequelize;

if (isMysqlConfigured) {
  sequelize = new Sequelize(
    process.env.DB_DATABASE || 'restaurant_jp',
    process.env.DB_USERNAME || 'root',
    process.env.DB_PASSWORD || '',
    {
      host: process.env.DB_HOST,
      port: process.env.DB_PORT || 3306,
      dialect: 'mysql',
      logging: process.env.NODE_ENV === 'development' ? console.log : false,
      define: {
        underscored: true,
        timestamps: true,
        createdAt: 'created_at',
        updatedAt: 'updated_at',
      },
    }
  );
} else {
  const dbPath = path.join(__dirname, '..', '..', 'database.sqlite');
  sequelize = new Sequelize({
    dialect: 'sqlite',
    storage: dbPath,
    logging: process.env.NODE_ENV === 'development' ? console.log : false,
    define: {
      underscored: true,
      timestamps: true,
      createdAt: 'created_at',
      updatedAt: 'updated_at',
    },
  });
}

module.exports = sequelize;
