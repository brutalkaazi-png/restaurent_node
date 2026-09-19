const { Op } = require('sequelize');
const { RestaurantTable } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');

// GET /tables
async function index(req, res) {
  const tables = await RestaurantTable.findAll({
    where: { restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false },
    order: [['id', 'DESC']],
  });
  return res.render('res/table/index', { tables, slug: req.currentUser.slug });
}

// GET /tables/create
function create(req, res) {
  return res.render('res/table/create', { table: null });
}

// GET /tables/:id/edit
async function edit(req, res) {
  const table = await RestaurantTable.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (!table) return res.status(404).send('Table not found');
  return res.render('res/table/create', { table });
}

// POST /tables  (upsert - same pattern as the Laravel store())
async function store(req, res) {
  const id = req.body.id;
  const table = id
    ? await RestaurantTable.findOne({ where: { id, restaurant_id: req.tenantId, branch_id: req.branchId } })
    : RestaurantTable.build({ restaurant_id: req.tenantId, branch_id: req.branchId });
  if (!table) return res.status(404).send('Table not found');

  const rawSlug = req.body.slug || req.body.name;
  let slug = sanitizeString(rawSlug);
  const existingSlugs = (
    await RestaurantTable.findAll({
      where: { restaurant_id: req.tenantId, branch_id: req.branchId, table_slug: { [Op.like]: `%${slug}%` } },
      attributes: ['table_slug'],
    })
  ).map((t) => t.table_slug);

  if (slug !== table.table_slug) {
    let i = 2;
    while (existingSlugs.includes(slug)) {
      slug = `${slug}-${i}`;
      i++;
    }
  }

  table.restaurant_id = req.tenantId;
  table.branch_id = req.branchId;
  table.table_name = req.body.name;
  table.table_slug = slug;
  if (!table.status) table.status = 'available';
  await table.save();

  return res.redirect('/tables');
}

// POST /tables/:id/delete
async function destroy(req, res) {
  const table = await RestaurantTable.findOne({ where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId } });
  if (table) await table.destroy();
  return res.redirect('/tables');
}

// NOTE: qr_code() from the original (App\Helpers\QRHelper::generate_table_qr)
// isn't ported - add a QR-code npm package (e.g. `qrcode`) and wire up
// /table-qrcode/:id here if you need printable table QR codes back. Each
// table's ordering URL is simply /{restaurant.slug}/menu/{table.table_slug},
// so a QR of that URL is all `generate_table_qr` was producing.

module.exports = { index, create, edit, store, destroy };
