const { Item, ItemVariant, Category, InventoryItem, RecipeItem } = require('../models');

// GET /recipes - Overview of all menu dishes, recipe status, food costs & margins
async function index(req, res) {
  const where = { user_id: req.tenantId };
  if (req.branchId) where.branch_id = req.branchId;

  const items = await Item.findAll({
    where,
    include: [
      { association: 'category' },
      { association: 'variants' },
      {
        model: RecipeItem,
        as: 'recipe_items',
        include: [{ model: InventoryItem, as: 'ingredient' }, { model: ItemVariant, as: 'variant' }],
      },
    ],
    order: [['item_name', 'ASC']],
  });

  const dishes = items.map((item) => {
    const plain = item.get({ plain: true });
    let totalCost = 0;

    (plain.recipe_items || []).forEach((r) => {
      const ingredient = r.ingredient;
      const unitCost = ingredient && ingredient.price_per_unit ? parseFloat(ingredient.price_per_unit) : 0;
      totalCost += parseFloat(r.quantity || 0) * unitCost;
    });

    const price = plain.price ? parseFloat(plain.price) : (plain.variants?.[0]?.price ? parseFloat(plain.variants[0].price) : 0);
    const foodCostPct = price > 0 ? Math.round((totalCost / price) * 100) : 0;
    const grossMargin = Math.max(0, price - totalCost);
    const marginPct = price > 0 ? Math.round((grossMargin / price) * 100) : 0;

    return {
      ...plain,
      totalCost,
      foodCostPct,
      grossMargin,
      marginPct,
      hasRecipe: (plain.recipe_items || []).length > 0,
      ingredientCount: (plain.recipe_items || []).length,
    };
  });

  return res.render('res/recipe/index', { dishes });
}

// GET /recipes/:itemId/edit - Bill of Materials (BOM) Editor
async function edit(req, res) {
  const item = await Item.findOne({
    where: { id: req.params.itemId, user_id: req.tenantId },
    include: [
      { association: 'category' },
      { association: 'variants' },
      {
        model: RecipeItem,
        as: 'recipe_items',
        include: [{ model: InventoryItem, as: 'ingredient' }, { model: ItemVariant, as: 'variant' }],
      },
    ],
  });

  if (!item) return res.status(404).send('Menu item not found.');

  // Fetch available inventory items for ingredient selector
  const ingredients = await InventoryItem.findAll({
    where: { user_id: req.tenantId },
    order: [['name', 'ASC']],
  });

  return res.render('res/recipe/edit', { item, ingredients, error: null });
}

// POST /recipes/:itemId - Add/Update Ingredient in Recipe
async function store(req, res) {
  try {
    const { inventory_item_id, item_variant_id, quantity } = req.body;
    const itemId = req.params.itemId;

    if (!inventory_item_id || !quantity || parseFloat(quantity) <= 0) {
      return res.redirect(`/recipes/${itemId}/edit?error=Please+select+an+ingredient+and+valid+quantity`);
    }

    const ingredient = await InventoryItem.findOne({
      where: { id: inventory_item_id, user_id: req.tenantId },
    });
    if (!ingredient) return res.status(404).send('Ingredient not found.');

    // Upsert recipe line
    let recipeLine = await RecipeItem.findOne({
      where: {
        restaurant_id: req.tenantId,
        item_id: itemId,
        item_variant_id: item_variant_id || null,
        inventory_item_id: inventory_item_id,
      },
    });

    if (recipeLine) {
      recipeLine.quantity = parseFloat(quantity);
      recipeLine.unit = ingredient.unit;
      await recipeLine.save();
    } else {
      await RecipeItem.create({
        restaurant_id: req.tenantId,
        branch_id: req.branchId || null,
        item_id: itemId,
        item_variant_id: item_variant_id || null,
        inventory_item_id: inventory_item_id,
        quantity: parseFloat(quantity),
        unit: ingredient.unit,
      });
    }

    return res.redirect(`/recipes/${itemId}/edit`);
  } catch (err) {
    console.error('Recipe save error:', err);
    return res.redirect(`/recipes/${req.params.itemId}/edit?error=${encodeURIComponent(err.message)}`);
  }
}

// POST /recipes/item/:id/delete - Remove Ingredient from Recipe
async function destroyIngredient(req, res) {
  try {
    const line = await RecipeItem.findOne({
      where: { id: req.params.id, restaurant_id: req.tenantId },
    });
    const itemId = line ? line.item_id : null;

    if (line) {
      await line.destroy();
    }

    if (itemId) {
      return res.redirect(`/recipes/${itemId}/edit`);
    }
    return res.redirect('/recipes');
  } catch (err) {
    console.error('Recipe delete error:', err);
    return res.redirect('/recipes');
  }
}

module.exports = { index, edit, store, destroyIngredient };