const { Op } = require('sequelize');
const { CustomerProfile, Order } = require('../models');

async function index(req, res) {
  const where = { restaurant_id: req.tenantId, branch_id: req.branchId };
  if (req.query.search) {
    where[Op.or] = [
      { name: { [Op.like]: `%${req.query.search}%` } },
      { email: { [Op.like]: `%${req.query.search}%` } },
      { phone: { [Op.like]: `%${req.query.search}%` } },
    ];
  }
  const customers = await CustomerProfile.findAll({ where, order: [['name', 'ASC']] });
  return res.render('res/customer/index', { customers, search: req.query.search || '' });
}

async function edit(req, res) {
  const customer = await CustomerProfile.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (!customer) return res.status(404).send('Customer not found');
  return res.render('res/customer/edit', { customer, errors: [] });
}

async function update(req, res) {
  const customer = await CustomerProfile.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (!customer) return res.status(404).send('Customer not found');
  customer.name = req.body.name || customer.name;
  customer.phone = req.body.phone || null;
  customer.email = req.body.email || null;
  customer.address = req.body.address || null;
  customer.notes = req.body.notes || null;
  await customer.save();
  return res.redirect('/customers');
}

async function history(req, res) {
  const customer = await CustomerProfile.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (!customer) return res.status(404).send('Customer not found');
  const where = { res_id: req.tenantId, branch_id: req.branchId };
  if (customer.customer_user_id) where.user_id = customer.customer_user_id;
  else if (customer.email) where.email = customer.email;
  else if (customer.phone) where.phone = customer.phone;
  else where.name = customer.name;
  const orders = await Order.findAll({ where, order: [['created_at', 'DESC']] });
  return res.render('res/customer/history', { customer, orders });
}

module.exports = { index, edit, update, history };
