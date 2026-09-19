function tenantIdFor(user) {
  if (!user || user.user_type === 'S') return null;
  return user.user_type === 'R' && user.user_role !== 'waiter' ? user.id : user.waiter_id;
}

function loadTenantContext(Branch) {
  return async (req, res, next) => {
    req.tenantId = null;
    req.branchId = null;
    res.locals.tenantId = null;
    res.locals.branchId = null;

    const tenantId = tenantIdFor(req.currentUser);
    if (!tenantId) return next();

    const requestedBranchId = req.query.branch_id || req.body?.branch_id || req.session?.branchId;
    const where = { restaurant_id: tenantId, is_active: true };
    if (requestedBranchId) where.id = requestedBranchId;

    let branch = await Branch.findOne({ where, order: [['id', 'ASC']] });
    if (!branch && requestedBranchId) {
      return res.status(403).send('That branch is not part of your restaurant.');
    }
    if (!branch) branch = await Branch.findOne({ where: { restaurant_id: tenantId, is_active: true }, order: [['id', 'ASC']] });

    req.tenantId = tenantId;
    req.branchId = branch ? branch.id : null;
    if (req.session) req.session.branchId = req.branchId;
    res.locals.tenantId = req.tenantId;
    res.locals.branchId = req.branchId;
    next();
  };
}

function branchScope(req, field = 'branch_id') {
  if (!req.branchId) return {};
  return { [field]: req.branchId };
}

function tenantScope(req, field = 'user_id') {
  if (!req.tenantId) return {};
  return { [field]: req.tenantId };
}

module.exports = { tenantIdFor, loadTenantContext, branchScope, tenantScope };
