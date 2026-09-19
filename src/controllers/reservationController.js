const { Op } = require('sequelize');
const { Reservation, RestaurantTable } = require('../models');

const ACTIVE_STATUSES = ['pending', 'confirmed', 'seated'];
const STATUSES = ['pending', 'confirmed', 'seated', 'completed', 'cancelled', 'no_show'];

function parseDate(value) {
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date;
}

async function findConflict({ restaurantId, branchId, tableId, startsAt, endsAt, excludeId }) {
  if (!tableId) return null;
  return Reservation.findOne({
    where: {
      restaurant_id: restaurantId,
      branch_id: branchId,
      table_id: tableId,
      status: { [Op.in]: ACTIVE_STATUSES },
      starts_at: { [Op.lt]: endsAt },
      ends_at: { [Op.gt]: startsAt },
      ...(excludeId ? { id: { [Op.ne]: excludeId } } : {}),
    },
  });
}

async function index(req, res) {
  const where = { restaurant_id: req.tenantId, branch_id: req.branchId };
  if (req.query.date) {
    const day = parseDate(`${req.query.date}T00:00:00`);
    if (day) {
      const next = new Date(day);
      next.setDate(next.getDate() + 1);
      where.starts_at = { [Op.lt]: next };
      where.ends_at = { [Op.gt]: day };
    }
  }
  const [reservations, tables] = await Promise.all([
    Reservation.findAll({ where, include: [{ association: 'table' }], order: [['starts_at', 'ASC']] }),
    RestaurantTable.findAll({ where: { restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false }, order: [['table_name', 'ASC']] }),
  ]);
  return res.render('res/reservation/index', { reservations, tables, selectedDate: req.query.date || '' });
}

async function create(req, res) {
  const tables = await RestaurantTable.findAll({ where: { restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false }, order: [['table_name', 'ASC']] });
  return res.render('res/reservation/create', { reservation: null, tables, errors: [] });
}

async function edit(req, res) {
  const [reservation, tables] = await Promise.all([
    Reservation.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } }),
    RestaurantTable.findAll({ where: { restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false }, order: [['table_name', 'ASC']] }),
  ]);
  if (!reservation) return res.status(404).send('Reservation not found');
  return res.render('res/reservation/create', { reservation, tables, errors: [] });
}

async function store(req, res) {
  const id = req.body.id || null;
  const startsAt = parseDate(req.body.starts_at);
  const endsAt = parseDate(req.body.ends_at);
  const guestCount = Number.parseInt(req.body.guest_count, 10);
  const errors = [];
  if (!req.body.customer_name) errors.push('Customer name is required.');
  if (!startsAt || !endsAt || endsAt <= startsAt) errors.push('A valid reservation time range is required.');
  if (!Number.isInteger(guestCount) || guestCount < 1) errors.push('Guest count must be at least 1.');

  let reservation = id
    ? await Reservation.findOne({ where: { id, restaurant_id: req.tenantId, branch_id: req.branchId } })
    : Reservation.build({ restaurant_id: req.tenantId, branch_id: req.branchId, status: 'pending' });
  if (!reservation) return res.status(404).send('Reservation not found');
  const tableId = req.body.table_id || null;
  if (tableId) {
    const table = await RestaurantTable.findOne({ where: { id: tableId, restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false } });
    if (!table) errors.push('Selected table is not part of this branch.');
  }
  if (!errors.length && await findConflict({ restaurantId: req.tenantId, branchId: req.branchId, tableId, startsAt, endsAt, excludeId: id })) {
    errors.push('That table is already reserved during this time.');
  }
  if (errors.length) {
    const tables = await RestaurantTable.findAll({ where: { restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false }, order: [['table_name', 'ASC']] });
    return res.status(422).render('res/reservation/create', { reservation: { ...req.body, id }, tables, errors });
  }

  Object.assign(reservation, {
    restaurant_id: req.tenantId,
    branch_id: req.branchId,
    table_id: tableId,
    customer_name: req.body.customer_name,
    customer_phone: req.body.customer_phone || null,
    customer_email: req.body.customer_email || null,
    guest_count: guestCount,
    starts_at: startsAt,
    ends_at: endsAt,
    notes: req.body.notes || null,
  });
  await reservation.save();
  return res.redirect('/reservations');
}

async function updateStatus(req, res) {
  if (!STATUSES.includes(req.body.status)) return res.status(422).json({ success: false, message: 'Invalid reservation status.' });
  const reservation = await Reservation.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (!reservation) return res.status(404).json({ success: false, message: 'Reservation not found.' });
  reservation.status = req.body.status;
  await reservation.save();
  return res.json({ success: true, status: reservation.status });
}

async function destroy(req, res) {
  await Reservation.destroy({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  return res.redirect('/reservations');
}

module.exports = { index, create, edit, store, updateStatus, destroy };
