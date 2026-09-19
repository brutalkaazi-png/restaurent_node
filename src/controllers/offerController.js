const { User, UserSubscription, Promotion } = require('../models');

// Ported from app/Http/Controllers/OfferController.php - public,
// unauthenticated "offers" pages, gated behind the restaurant having an
// active subscription (unlike the main ordering menu, which isn't gated
// this way).

// GET /:slug/offer/:promotionslug
async function show(req, res) {
  const restaurant = await User.findOne({ where: { slug: req.params.slug } });
  if (!restaurant) return res.status(404).send('Not found');

  const activeSubscription = await UserSubscription.findOne({
    where: { user_id: restaurant.id, subscription_status: 'active' },
  });
  if (!activeSubscription) {
    return res.render('offer_inactive', { restaurant });
  }

  const promotion = await Promotion.findOne({
    where: { restaurant_id: restaurant.id, slug: req.params.promotionslug, is_active: 'Active' },
    include: [{ association: 'items', include: [{ association: 'item' }] }],
  });
  if (!promotion) return res.status(404).send('Not found');

  return res.render('offer', { restaurant, promotion });
}

// GET /:slug/offer  (all active promotions for this restaurant)
async function index(req, res) {
  const restaurant = await User.findOne({ where: { slug: req.params.slug } });
  if (!restaurant) return res.status(404).send('Not found');

  const activeSubscription = await UserSubscription.findOne({
    where: { user_id: restaurant.id, subscription_status: 'active' },
  });
  if (!activeSubscription) {
    return res.render('offer_inactive', { restaurant });
  }

  const promotions = await Promotion.findAll({
    where: { restaurant_id: restaurant.id, is_active: 'Active' },
    include: [{ association: 'items', include: [{ association: 'item' }] }],
  });

  return res.render('offer-all', { restaurant, promotions });
}

module.exports = { show, index };
