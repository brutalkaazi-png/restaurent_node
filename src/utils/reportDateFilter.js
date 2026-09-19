// Shared date-range resolution for the SuperAdmin order-report family
// (OrderReportController.php / TableOrderReportController.php both use
// this exact daily/monthly/yearly/custom switch). Kept separate from
// inventoryReportController.js's resolveDateRange (which also handles
// 'weekly' and is already tested/working) rather than forcing both to
// share one over-general helper.
//
// NOTE on 'custom': the original's `list($start_date, $end_date) =
// explode('|', $date_range); $start_date = date($start_date);` looks like
// a real bug - PHP's global date() expects a Unix timestamp as its first
// (well, second) argument, not a date string, so passing a string like
// "2026-01-01" there is not valid usage and wouldn't produce what the
// author intended. This port parses the two dates properly instead of
// reproducing that bug.
function resolveDateRange(datePeriod, dateRange) {
  if (!dateRange) return null;
  switch (datePeriod) {
    case 'daily':
      return { start: new Date(`${dateRange}T00:00:00`), end: new Date(`${dateRange}T23:59:59.999`) };
    case 'monthly': {
      const [month, year] = dateRange.split('-');
      const start = new Date(year, month - 1, 1, 0, 0, 0, 0);
      const end = new Date(year, month, 0, 23, 59, 59, 999);
      return { start, end };
    }
    case 'yearly':
      return { start: new Date(`${dateRange}-01-01T00:00:00`), end: new Date(`${dateRange}-12-31T23:59:59.999`) };
    case 'custom': {
      const [start, end] = dateRange.split('|');
      return { start: new Date(`${start}T00:00:00`), end: new Date(`${end}T23:59:59.999`) };
    }
    default:
      return null;
  }
}

module.exports = { resolveDateRange };
