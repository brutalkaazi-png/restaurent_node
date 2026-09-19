const { Op } = require('sequelize');
const QRCode = require('../utils/qrHelper');
const { RestaurantTable, User } = require('../models');
const { sanitizeString } = require('../utils/stringHelper');

// GET /tables
async function index(req, res) {
  const tables = await RestaurantTable.findAll({
    where: { restaurant_id: req.tenantId, branch_id: req.branchId, is_virtual: false },
    order: [['id', 'DESC']],
  });
  const restaurant = req.currentUser;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');

  const tablesWithQr = await Promise.all(
    tables.map(async (table) => {
      const menuPath = `/${restaurant.slug}/menu/${table.table_slug}`;
      const menuUrl = `${protocol}://${host}${menuPath}`;
      let qrDataUrl = '';
      try {
        qrDataUrl = await QRCode.toDataURL(menuUrl, {
          width: 400,
          margin: 2,
          color: { dark: '#0f172a', light: '#ffffff' },
          errorCorrectionLevel: 'H',
        });
      } catch (err) {
        console.error('QR code generation failed:', err);
      }
      return {
        ...table.toJSON(),
        menuPath,
        menuUrl,
        qrDataUrl,
      };
    })
  );

  return res.render('res/table/index', { tables: tablesWithQr, slug: restaurant.slug, restaurant });
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

// GET /tables/:id/qr-data
async function getQrData(req, res) {
  const table = await RestaurantTable.findOne({
    where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId },
    include: [{ model: User, as: 'restaurant' }],
  });
  if (!table) return res.status(404).json({ success: false, error: 'Table not found' });

  const restaurant = table.restaurant || req.currentUser;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const menuPath = `/${restaurant.slug}/menu/${table.table_slug}`;
  const menuUrl = `${protocol}://${host}${menuPath}`;

  const qrDataUrl = await QRCode.toDataURL(menuUrl, {
    width: 400,
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
    errorCorrectionLevel: 'H',
  });

  const qrSvg = await QRCode.toString(menuUrl, {
    type: 'svg',
    margin: 2,
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  return res.json({
    success: true,
    table: {
      id: table.id,
      name: table.table_name,
      slug: table.table_slug,
      status: table.status,
    },
    restaurant: {
      id: restaurant.id,
      name: restaurant.name,
      slug: restaurant.slug,
      logo: restaurant.logo,
      address: restaurant.address,
    },
    menuUrl,
    menuPath,
    qrDataUrl,
    qrSvg,
  });
}

// GET /tables/:id/qr-download
async function downloadQr(req, res) {
  const table = await RestaurantTable.findOne({
    where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId },
    include: [{ model: User, as: 'restaurant' }],
  });
  if (!table) return res.status(404).send('Table not found');

  const restaurant = table.restaurant || req.currentUser;
  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const menuUrl = `${protocol}://${host}/${restaurant.slug}/menu/${table.table_slug}`;

  const buffer = await QRCode.toBuffer(menuUrl, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  res.setHeader('Content-Type', 'image/png');
  res.setHeader('Content-Disposition', `attachment; filename="table-${table.table_slug}-qr.png"`);
  return res.send(buffer);
}

// GET /table-qrcode/:id (direct view/download for placards or printing)
async function renderPublicQr(req, res) {
  const table = await RestaurantTable.findByPk(req.params.id, {
    include: [{ model: User, as: 'restaurant' }],
  });
  if (!table || !table.restaurant) return res.status(404).send('Table not found');

  const protocol = req.headers['x-forwarded-proto'] || req.protocol || 'http';
  const host = req.headers['x-forwarded-host'] || req.get('host');
  const menuUrl = `${protocol}://${host}/${table.restaurant.slug}/menu/${table.table_slug}`;

  const buffer = await QRCode.toBuffer(menuUrl, {
    width: 800,
    margin: 2,
    errorCorrectionLevel: 'H',
    color: { dark: '#0f172a', light: '#ffffff' },
  });

  res.setHeader('Content-Type', 'image/png');
  return res.send(buffer);
}

module.exports = {
  index,
  create,
  edit,
  store,
  destroy,
  getQrData,
  downloadQr,
  renderPublicQr,
};

