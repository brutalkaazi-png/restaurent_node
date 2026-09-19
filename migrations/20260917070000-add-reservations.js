'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const tables = await queryInterface.showAllTables();
    const names = new Set(tables.map((table) => (typeof table === 'string' ? table : table.tableName)));
    if (names.has('reservations')) return;
    await queryInterface.createTable('reservations', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      restaurant_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      branch_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      table_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: true },
      customer_name: { type: Sequelize.STRING, allowNull: false },
      customer_phone: Sequelize.STRING,
      customer_email: Sequelize.STRING,
      guest_count: { type: Sequelize.INTEGER, allowNull: false },
      starts_at: { type: Sequelize.DATE, allowNull: false },
      ends_at: { type: Sequelize.DATE, allowNull: false },
      notes: Sequelize.TEXT,
      status: { type: Sequelize.STRING, allowNull: false, defaultValue: 'pending' },
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
  },

  async down(queryInterface) {
    await queryInterface.dropTable('reservations');
  },
};