const { Op } = require('sequelize');
const { StaffCall, RestaurantTable } = require('../models');
const { notifyRestaurant } = require('../utils/events');

const allowedTypes = ['general', 'water', 'bill'];

async function create(req, res) {
  const type = allowedTypes.includes(req.body.type) ? req.body.type : 'general';
  const table = await RestaurantTable.findOne({
    where: {
      id: req.params.tableId,
      ...(req.branchId ? { branch_id: req.branchId } : {}),
    },
  });
  if (!table) return res.status(404).json({ success: false, message: 'Table not found.' });
  if (!table.branch_id) return res.status(409).json({ success: false, message: 'This table is not assigned to a branch.' });
  const existing = await StaffCall.findOne({ where: { table_id: table.id, branch_id: table.branch_id, status: 'pending' } });
  if (existing) return res.status(409).json({ success: false, message: 'A staff call is already pending for this table.' });

  const call = await StaffCall.create({ restaurant_id: table.restaurant_id, branch_id: table.branch_id, table_id: table.id, type });
  notifyRestaurant(table.restaurant_id, { reason: 'staff-call', staffCallId: call.id });
  return res.status(201).json({ success: true, message: 'Staff has been notified.' });
}

async function index(req, res) {
  const calls = await StaffCall.findAll({
    where: { restaurant_id: req.currentUser.id, branch_id: req.branchId, status: 'pending' },
    include: [{ association: 'table', attributes: ['id', 'table_name'] }],
    order: [['created_at', 'ASC']],
  });
  return res.render('res/staff-calls', { calls });
}

async function resolve(req, res) {
  const call = await StaffCall.findOne({ where: { id: req.params.id, restaurant_id: req.currentUser.id, branch_id: req.branchId, status: 'pending' } });
  if (!call) return res.status(404).json({ success: false, message: 'Staff call not found.' });
  await call.update({ status: 'resolved', resolved_at: new Date() });
  notifyRestaurant(call.restaurant_id, { reason: 'staff-call-updated', staffCallId: call.id });
  return res.json({ success: true });
}

async function countPending(req, res) {
  const count = await StaffCall.count({ where: { restaurant_id: req.currentUser.id, branch_id: req.branchId, status: { [Op.eq]: 'pending' } } });
  return res.json({ count });
}

module.exports = { create, index, resolve, countPending };