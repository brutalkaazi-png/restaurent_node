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

// POST /tables  (upsert - supports standard and AJAX modal submissions)
// POST /tables  (upsert - supports standard and AJAX modal submissions)
async function store(req, res) {
  try {
    const id = req.body.id;
    const restaurantId = req.currentUser ? req.currentUser.id : req.tenantId;
    const branchId = req.branchId || null;

    const tableWhere = { restaurant_id: restaurantId };
    if (id) tableWhere.id = id;

    const table = id
      ? await RestaurantTable.findOne({ where: tableWhere })
      : RestaurantTable.build({ restaurant_id: restaurantId, branch_id: branchId });

    if (!table) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Table not found.' });
      }
      return res.status(404).send('Table not found');
    }

    const rawSlug = req.body.slug || req.body.name;
    let slug = sanitizeString(rawSlug);
    const existingSlugs = (
      await RestaurantTable.findAll({
        where: {
          restaurant_id: restaurantId,
          table_slug: { [Op.like]: `%${slug}%` },
          ...(id ? { id: { [Op.ne]: id } } : {}),
        },
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

    table.restaurant_id = restaurantId;
    if (branchId) table.branch_id = branchId;
    table.table_name = req.body.name.trim();
    table.table_slug = slug;
    if (!table.status) table.status = 'available';
    await table.save();

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true, table });
    }
    return res.redirect('/tables');
  } catch (error) {
    console.error('Table save error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: error.message });
    }
    return res.status(500).send('Error saving table');
  }
}
// POST /tables/:id/delete (supports AJAX & traditional form post)
async function destroy(req, res) {
  try {
    const table = await RestaurantTable.findOne({
      where: { id: req.params.id, restaurant_id: req.tenantId, branch_id: req.branchId },
    });
    if (table) {
      const { TableCustomer } = require('../models');
      await TableCustomer.destroy({ where: { table_id: table.id } });
      await table.destroy();
    }

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({ success: true });
    }
    return res.redirect('/tables');
  } catch (error) {
    console.error('Table delete error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({ success: false, message: 'Could not delete table.' });
    }
    return res.redirect('/tables');
  }
}

// POST /tables/:id/reset (resets table to available, clears token, cart, and payment locks)
async function resetTable(req, res) {
  try {
    const tableId = req.params.id;

    // Direct find by primary key (id)
    const table = await RestaurantTable.findByPk(tableId);
    if (!table) {
      if (req.xhr || req.headers.accept?.includes('application/json')) {
        return res.status(404).json({ success: false, message: 'Table not found.' });
      }
      return res.redirect('/tables');
    }

    const { sequelize, TableCustomer, TableCustomersPreorder } = require('../models');

    // 1. Clear cart rows for this table
    try {
      await TableCustomer.destroy({ where: { table_id: tableId } });
      await TableCustomersPreorder.destroy({ where: { table_id: tableId } });
    } catch (e) {
      console.warn('TableCustomer delete notice:', e.message);
    }

    // 2. Set table to available and null out tokens
    table.status = 'available';
    table.table_token = null;
    table.owner_session_id = null;
    await table.save();

    // 3. Clear cache lock
    try {
      const cache = require('../utils/cacheStore');
      cache.forget(`payment_lock_table_${tableId}`);
    } catch (e) {}

    // 4. Notify sockets
    try {
      const { notifyRestaurant } = require('../utils/events');
      notifyRestaurant(table.restaurant_id, { reason: 'status-change', tableId });
    } catch (e) {}

    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.json({
        success: true,
        message: `${table.table_name} is now available!`,
        table,
      });
    }
    return res.redirect('/tables');
  } catch (error) {
    console.error('Reset Table Error:', error);
    if (req.xhr || req.headers.accept?.includes('application/json')) {
      return res.status(500).json({
        success: false,
        message: error.message || 'Error resetting table.',
      });
    }
    return res.redirect('/tables');
  }
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
  resetTable,
  getQrData,
  downloadQr,
  renderPublicQr,
};

