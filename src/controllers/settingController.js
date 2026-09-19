const { Setting } = require('../models');

// Ported from app/Http/Controllers/SuperAdmin/SettingController.php - the
// platform-level key/value settings (currency, admin email, etc.) that
// src/utils/settingHelper.js already reads from for the rest of the app.

// GET /superadmin/setting
async function index(req, res) {
  const settings = await Setting.findAll({ where: { del_status: 0 } });
  return res.render('superadmin/settings/index', { settings });
}

// GET /superadmin/setting/create  (a bulk edit form over ALL settings, matching the original)
async function create(req, res) {
  const settings = await Setting.findAll();
  return res.render('superadmin/settings/create', { settings });
}

// POST /superadmin/setting/store  ({ option_value: { currency: '$', admin_email: '...' } })
async function store(req, res) {
  const requestData = req.body.option_value || {};
  for (const [name, value] of Object.entries(requestData)) {
    const existing = await Setting.findOne({ where: { option_name: name } });
    if (existing) {
      existing.option_value = value;
      await existing.save();
    } else {
      await Setting.create({ option_name: name, option_value: value });
    }
  }
  return res.redirect('/superadmin/setting/create');
}

// GET /superadmin/setting/:id/edit
async function edit(req, res) {
  const setting = await Setting.findByPk(req.params.id);
  if (!setting) return res.status(404).send('Not found');
  return res.render('superadmin/settings/edit', { setting });
}

// POST /superadmin/setting/:id
async function update(req, res) {
  const setting = await Setting.findByPk(req.params.id);
  if (!setting) return res.status(404).send('Not found');
  setting.option_name = req.body.option_name;
  setting.option_value = req.body.option_value;
  await setting.save();
  return res.redirect('/superadmin/setting');
}

// POST /superadmin/setting/:id/delete
async function destroy(req, res) {
  const setting = await Setting.findByPk(req.params.id);
  if (setting) {
    setting.del_status = 1;
    await setting.save();
  }
  return res.redirect('/superadmin/setting');
}

module.exports = { index, create, store, edit, update, destroy };
