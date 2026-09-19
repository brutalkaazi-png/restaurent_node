const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Minimal port - covers the columns TableMenuController actually reads.
// Extend with the rest of the menu_templates columns if/when the
// SuperAdmin template-builder module is ported.
const MenuTemplate = sequelize.define(
  'MenuTemplate',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    user_id: DataTypes.BIGINT.UNSIGNED,
    branch_id: DataTypes.BIGINT.UNSIGNED,
    template_id: DataTypes.BIGINT.UNSIGNED,
    show_product_image: { type: DataTypes.BOOLEAN, defaultValue: false },
    show_category_image: { type: DataTypes.BOOLEAN, defaultValue: false },
  },
  { tableName: 'menu_templates' }
);

module.exports = MenuTemplate;
