'use strict';

module.exports = {
  async up(queryInterface, Sequelize) {
    await queryInterface.createTable('staff_calls', {
      id: { type: Sequelize.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
      restaurant_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      branch_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      table_id: { type: Sequelize.BIGINT.UNSIGNED, allowNull: false },
      type: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'general' },
      status: { type: Sequelize.STRING(50), allowNull: false, defaultValue: 'pending' },
      resolved_at: Sequelize.DATE,
      created_at: Sequelize.DATE,
      updated_at: Sequelize.DATE,
    });
    await queryInterface.addIndex('staff_calls', ['branch_id', 'status']);
  },
  async down(queryInterface) {
    await queryInterface.dropTable('staff_calls');
  },
};