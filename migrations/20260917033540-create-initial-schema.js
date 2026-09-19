'use strict';

const fs = require('fs');
const path = require('path');

const tableNames = [
  'user_subscriptions',
  'branches',
  'reservations',
  'customer_profiles',
  'subscriptions',
  'menu_templates',
  'inventory_transactions',
  'inventory_items',
  'promotion_items',
  'promotions',
  'discount_items',
  'discounts',
  'order_items',
  'orders',
  'table_customers_preorders',
  'table_customers',
  'restaurant_tables',
  'toppings',
  'item_variants',
  'items',
  'categories',
  'settings',
  'districts',
  'users',
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const schemaPath = path.join(__dirname, '..', 'sql', 'schema.sql');
    const statements = fs
      .readFileSync(schemaPath, 'utf8')
      .replace(/^--.*$/gm, '')
      .split(';')
      .map((statement) => statement.trim())
      .filter((statement) => statement.startsWith('CREATE TABLE'));

    for (const statement of statements) {
      await queryInterface.sequelize.query(statement);
    }
  },

  async down(queryInterface) {
    const existingTables = new Set(
      (await queryInterface.showAllTables()).map((table) =>
        typeof table === 'string' ? table : table.tableName
      )
    );

    for (const tableName of tableNames) {
      if (existingTables.has(tableName)) {
        await queryInterface.dropTable(tableName);
      }
    }
  }
};
