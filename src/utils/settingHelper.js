const { Setting } = require('../models');

// Ports App\Helpers\SettingHelper::setting() - flattens the settings table
// (option_name -> option_value rows) into a plain object.
async function getSettings() {
  const rows = await Setting.findAll();
  const settings = {};
  rows.forEach((row) => {
    settings[row.option_name] = row.option_value;
  });
  if (!settings.currency) settings.currency = '$';
  return settings;
}

module.exports = { getSettings };
