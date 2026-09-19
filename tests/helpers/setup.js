// Shared test setup: rebuilds the schema from sql/schema.sql against
// whatever DB the environment's .env/.env.test points at, then exposes
// helpers to seed a baseline restaurant/table/category/item fixture and
// to build a fresh (unlistened) app instance for supertest.
//
// Requires a real MySQL/MariaDB reachable with the configured
// credentials - these are integration tests against a real database, the
// same way every round of manual testing in this project was done, not
// mocked-model unit tests.

const fs = require('fs');
const path = require('path');
require('dotenv').config({ path: path.join(__dirname, '..', '..', '.env.test') });

const { sequelize } = require('../../src/models');
const createApp = require('../../src/app');
const bcrypt = require('bcryptjs');

async function resetDatabase() {
  const schemaSql = fs.readFileSync(path.join(__dirname, '..', '..', 'sql', 'schema.sql'), 'utf8');

  // Drop everything first (in FK-safe order - reverse of creation order,
  // roughly) so re-running this between test files always starts clean,
  // not just "CREATE TABLE IF NOT EXISTS" over old rows.
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 0');
  const tableNames = [...schemaSql.matchAll(/CREATE TABLE IF NOT EXISTS (\w+)/g)].map((m) => m[1]);
  for (const table of tableNames) {
    await sequelize.query(`DROP TABLE IF EXISTS \`${table}\``);
  }
  await sequelize.query('SET FOREIGN_KEY_CHECKS = 1');

  const statements = schemaSql.split(';').map((s) => s.trim()).filter(Boolean);
  for (const statement of statements) {
    await sequelize.query(statement);
  }
}

// Seeds one restaurant owner + one table + one category + one item -
// the same minimal fixture used by hand in every manual test round.
async function seedBaseline() {
  const { User, Branch, RestaurantTable, Category, Item } = require('../../src/models');

  const passwordHash = await bcrypt.hash('password123', 10);
  const restaurant = await User.create({
    name: 'Demo Restaurant',
    slug: 'demo-restaurant',
    email: 'owner@example.com',
    password: passwordHash,
    status: 'approved',
    user_type: 'R',
    pay_first: false,
  });

  const branch = await Branch.create({ restaurant_id: restaurant.id, name: 'Main Branch', slug: 'main', is_active: true });

  const table = await RestaurantTable.create({
    restaurant_id: restaurant.id,
    branch_id: branch.id,
    table_name: 'Table 1',
    table_slug: 'table-1',
    status: 'available',
  });

  const category = await Category.create({
    user_id: restaurant.id,
    branch_id: branch.id,
    category_name: 'Starters',
    category_order: 1,
  });

  const item = await Item.create({
    user_id: restaurant.id,
    branch_id: branch.id,
    item_name: 'Spring Rolls',
    item_slug: 'spring-rolls',
    item_category: category.id,
    price: 10.0,
    item_order: 1,
  });

  return { restaurant, branch, table, category, item };
}

function getApp() {
  return createApp();
}

async function closeAll() {
  await sequelize.close();
}

module.exports = { resetDatabase, seedBaseline, getApp, closeAll, sequelize };
