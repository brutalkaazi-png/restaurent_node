'use strict';

const tenantColumns = [
  ['categories', 'user_id'],
  ['items', 'user_id'],
  ['restaurant_tables', 'restaurant_id'],
  ['orders', 'res_id'],
  ['inventory_items', 'user_id'],
  ['discounts', 'restaurant_id'],
  ['promotions', 'restaurant_id'],
  ['menu_templates', 'user_id'],
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const tableNames = new Set(tables.map((table) => (typeof table === 'string' ? table : table.tableName)));
    if (!tableNames.has('branches')) {
      await queryInterface.createTable('branches', {
        id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
        restaurant_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
        name: { type: Sequelize.STRING, allowNull: false },
        slug: { type: Sequelize.STRING, allowNull: false },
        is_active: { type: Sequelize.BOOLEAN, allowNull: false, defaultValue: true },
        created_at: Sequelize.DATE,
        updated_at: Sequelize.DATE,
      });
    }

    for (const [table, tenantColumn] of tenantColumns) {
      const columns = await queryInterface.describeTable(table);
      if (!columns.branch_id) {
        await queryInterface.addColumn(table, 'branch_id', { type: Sequelize.BIGINT.UNSIGNED, allowNull: true });
      }
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` record JOIN branches branch ON branch.restaurant_id = record.\`${tenantColumn}\` SET record.branch_id = branch.id WHERE record.branch_id IS NULL`
      );
    }

    await queryInterface.sequelize.query(
      `INSERT INTO branches (restaurant_id, name, slug, is_active, created_at, updated_at)
       SELECT u.id, 'Main Branch', 'main', TRUE, NOW(), NOW()
       FROM users u
       WHERE u.user_type = 'R' AND (u.user_role IS NULL OR u.user_role <> 'waiter')
       AND NOT EXISTS (SELECT 1 FROM branches b WHERE b.restaurant_id = u.id)`
    );

    for (const [table, tenantColumn] of tenantColumns) {
      await queryInterface.sequelize.query(
        `UPDATE \`${table}\` record JOIN branches branch ON branch.restaurant_id = record.\`${tenantColumn}\` SET record.branch_id = branch.id WHERE record.branch_id IS NULL`
      );
    }
  },

  async down(queryInterface) {
    for (const [table] of tenantColumns) {
      const columns = await queryInterface.describeTable(table);
      if (columns.branch_id) await queryInterface.removeColumn(table, 'branch_id');
    }
    const tables = await queryInterface.showAllTables();
    const tableNames = new Set(tables.map((table) => (typeof table === 'string' ? table : table.tableName)));
    if (tableNames.has('branches')) await queryInterface.dropTable('branches');
  },
};