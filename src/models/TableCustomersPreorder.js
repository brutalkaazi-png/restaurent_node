const { DataTypes } = require('sequelize');
const sequelize = require('../config/database');

// Ported from app/Models/TableCustomersPreorder.php. Used only in the
// "pay_first" restaurant flow: once a pay-first order is approved at the
// counter, its TableCustomer rows are copied here (keyed by the table's
// token) so kitchen/bar can work the ticket while the table itself is
// already cleared/free for the next guest.
const TableCustomersPreorder = sequelize.define(
  'TableCustomersPreorder',
  {
    id: { type: DataTypes.BIGINT.UNSIGNED, autoIncrement: true, primaryKey: true },
    table_id: DataTypes.BIGINT.UNSIGNED,
    item_id: DataTypes.BIGINT.UNSIGNED,
    item_variant_id: DataTypes.BIGINT.UNSIGNED,
    quantity: DataTypes.INTEGER,
    price: DataTypes.FLOAT,
    status: DataTypes.STRING, // approved|preparing|order_food|order_drink|order_delivered|cancelled|cancelled_pending
    token: DataTypes.STRING,
    remarks: DataTypes.TEXT,
    toppings: { type: DataTypes.JSON, allowNull: true },
  },
  { tableName: 'table_customers_preorders' }
);

module.exports = TableCustomersPreorder;
