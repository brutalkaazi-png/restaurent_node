const { Op, fn, col, literal } = require('sequelize');
const { sequelize, InventoryItem, InventoryTransaction } = require('../models');

// Ported from app/Http/Controllers/SuperAdmin/InventoryReportController.php -
// opening/closing stock report for a date period (daily/weekly/monthly/
// yearly/custom), computed the same way as the original: sum every
// transaction before the period starts for "opening stock", then sum
// in/out separately within the period.

function startOfWeek(date) {
  const d = new Date(date);
  const day = d.getDay(); // 0 = Sunday
  const diff = d.getDate() - day + (day === 0 ? -6 : 1); // ISO week: Monday start, matching Carbon's default
  return new Date(d.getFullYear(), d.getMonth(), diff, 0, 0, 0, 0);
}
function endOfWeek(date) {
  const start = startOfWeek(date);
  const end = new Date(start);
  end.setDate(end.getDate() + 6);
  end.setHours(23, 59, 59, 999);
  return end;
}

function resolveDateRange(datePeriod, dateRange) {
  const today = new Date();
  switch (datePeriod) {
    case 'weekly': {
      const date = dateRange ? new Date(dateRange) : today;
      return { start: startOfWeek(date), end: endOfWeek(date) };
    }
    case 'monthly': {
      const [month, year] = dateRange ? dateRange.split('-') : [today.getMonth() + 1, today.getFullYear()];
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999); // day 0 of next month = last day of this month
      return { start, end };
    }
    case 'yearly': {
      const year = dateRange || today.getFullYear();
      return { start: new Date(`${year}-01-01T00:00:00`), end: new Date(`${year}-12-31T23:59:59.999`) };
    }
    case 'custom': {
      if (!dateRange) return { start: null, end: null };
      const [from, to] = dateRange.split('|');
      return { start: new Date(`${from}T00:00:00`), end: new Date(`${to}T23:59:59.999`) };
    }
    case 'daily':
    default: {
      const date = dateRange ? new Date(dateRange) : today;
      const start = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 0, 0, 0, 0);
      const end = new Date(date.getFullYear(), date.getMonth(), date.getDate(), 23, 59, 59, 999);
      return { start, end };
    }
  }
}

// GET /inventory-report
async function index(req, res) {
  const datePeriod = req.query.date_period || 'daily';
  const dateRange = req.query.selected_date;
  const { start: startDate, end: endDate } = resolveDateRange(datePeriod, dateRange);

  const items = await InventoryItem.findAll({ where: { user_id: req.currentUser.id } });
  const reportData = [];

  for (const item of items) {
    const beforeTotal = await InventoryTransaction.findOne({
      where: { inventory_item_id: item.id, ...(startDate ? { created_at: { [Op.lt]: startDate } } : {}) },
      attributes: [[fn('SUM', literal("CASE WHEN type = 'in' THEN quantity ELSE -quantity END")), 'total']],
      raw: true,
    });
    const openingStock = parseFloat(beforeTotal.total || 0);

    const duringPeriod = await InventoryTransaction.findAll({
      where: {
        inventory_item_id: item.id,
        ...(startDate && endDate ? { created_at: { [Op.between]: [startDate, endDate] } } : {}),
      },
      attributes: ['type', [fn('SUM', col('quantity')), 'total_quantity']],
      group: ['type'],
      raw: true,
    });

    const stockIn = parseFloat(duringPeriod.find((r) => r.type === 'in')?.total_quantity || 0);
    const stockOut = parseFloat(duringPeriod.find((r) => r.type === 'out')?.total_quantity || 0);

    reportData.push({
      name: item.name,
      unit: item.unit,
      opening_stock: openingStock,
      stock_in: stockIn,
      stock_out: stockOut,
      closing_stock: openingStock + stockIn - stockOut,
    });
  }

  return res.render('res/inventory/report', { reportData, startDate, datePeriod, dateRange: dateRange || '' });
}

module.exports = { index };
