'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = new Set(tables.map((table) => (typeof table === 'string' ? table : table.tableName)));
    if (names.has('customer_profiles')) return;
    await queryInterface.createTable('customer_profiles', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      restaurant_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      branch_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      customer_user_id: Sequelize.BIGINT.UNSIGNED,
      name: { type: Sequelize.STRING, allowNull: false },
      email: Sequelize.STRING,
      phone: Sequelize.STRING,
      address: Sequelize.STRING,
      notes: Sequelize.TEXT,
      loyalty_points: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      visit_count: { type: Sequelize.INTEGER, allowNull: false, defaultValue: 0 },
      total_spend: { type: Sequelize.DECIMAL(12, 2), allowNull: false, defaultValue: 0 },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('customer_profiles');
  },
};