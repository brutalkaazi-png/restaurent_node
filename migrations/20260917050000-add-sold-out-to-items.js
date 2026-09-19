'use strict';

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface, Sequelize) {
    const columns = await queryInterface.describeTable('items');
    if (!columns.sold_out) {
      await queryInterface.addColumn('items', 'sold_out', {
        type: Sequelize.BOOLEAN,
        allowNull: false,
        defaultValue: false,
      });
    }
  },

  async down(queryInterface) {
    const columns = await queryInterface.describeTable('items');
    if (columns.sold_out) await queryInterface.removeColumn('items', 'sold_out');
  },
};
