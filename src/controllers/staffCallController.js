const { Op } = require('sequelize');
const { StaffCall, RestaurantTable } = require('../models');
const { notifyRestaurant } = require('../utils/events');

const allowedTypes = ['general', 'water', 'bill', 'cutlery', 'clean'];

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

  const existing = await StaffCall.findOne({
    where: { table_id: table.id, branch_id: table.branch_id, status: 'pending' },
  });
  if (existing) {
    return res.status(409).json({
      success: false,
      message: `A staff call is already pending for Table ${table.table_name}. Our team is on the way!`,
    });
  }

  const call = await StaffCall.create({
    restaurant_id: table.restaurant_id,
    branch_id: table.branch_id,
    table_id: table.id,
    type,
    status: 'pending',
  });

  notifyRestaurant(table.restaurant_id, {
    reason: 'staff-call',
    staffCallId: call.id,
    tableName: table.table_name,
    type,
  });

  return res.status(201).json({
    success: true,
    message: `Floor staff has been notified for Table ${table.table_name}.`,
    callId: call.id,
  });
}

async function index(req, res) {
  const [pendingCalls, resolvedCalls] = await Promise.all([
    StaffCall.findAll({
      where: { restaurant_id: req.currentUser.id, branch_id: req.branchId, status: 'pending' },
      include: [{ association: 'table', attributes: ['id', 'table_name', 'status'] }],
      order: [['created_at', 'ASC']],
    }),
    StaffCall.findAll({
      where: { restaurant_id: req.currentUser.id, branch_id: req.branchId, status: 'resolved' },
      include: [{ association: 'table', attributes: ['id', 'table_name'] }],
      order: [['resolved_at', 'DESC']],
      limit: 20,
    }),
  ]);

  return res.render('res/staff-calls', { calls: pendingCalls, resolvedCalls });
}

async function resolve(req, res) {
  const call = await StaffCall.findOne({
    where: { id: req.params.id, restaurant_id: req.currentUser.id, branch_id: req.branchId, status: 'pending' },
    include: [{ association: 'table' }],
  });
  if (!call) return res.status(404).json({ success: false, message: 'Staff call not found or already resolved.' });

  await call.update({ status: 'resolved', resolved_at: new Date() });

  notifyRestaurant(call.restaurant_id, {
    reason: 'staff-call-updated',
    staffCallId: call.id,
    tableName: call.table ? call.table.table_name : '',
  });

  return res.json({ success: true, message: 'Staff call marked resolved.' });
}

async function countPending(req, res) {
  const count = await StaffCall.count({
    where: { restaurant_id: req.currentUser.id, branch_id: req.branchId, status: { [Op.eq]: 'pending' } },
  });
  return res.json({ count });
}

async function clearResolved(req, res) {
  await StaffCall.destroy({
    where: { restaurant_id: req.currentUser.id, branch_id: req.branchId, status: 'resolved' },
  });
  return res.json({ success: true });
}

module.exports = { create, index, resolve, countPending, clearResolved };