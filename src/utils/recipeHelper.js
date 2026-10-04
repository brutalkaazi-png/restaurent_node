const { RecipeItem, InventoryItem, InventoryTransaction, Item } = require('../models');

/**
 * Deducts raw inventory ingredients based on item recipes and records an audit log.
 * @param {Array} orderItems Array of items containing { item_id, item_variant_id, quantity }
 * @param {Number} restaurantId
 * @param {Number} branchId
 * @param {String} reference Reference tag (e.g., 'Table 1 - Order #10')
 */
async function deductInventoryForOrder(orderItems, restaurantId, branchId, reference = '') {
  if (!orderItems || !orderItems.length) return;

  for (const orderedItem of orderItems) {
    const itemId = orderedItem.item_id;
    const variantId = orderedItem.item_variant_id || null;
    const qtyOrdered = Number(orderedItem.quantity || orderedItem.qty || 1);

    if (qtyOrdered <= 0) continue;

    // Find recipe lines for this item
    const whereClause = {
      restaurant_id: restaurantId,
      item_id: itemId,
    };
    if (branchId) whereClause.branch_id = branchId;

    const recipes = await RecipeItem.findAll({
      where: whereClause,
      include: [{ model: InventoryItem, as: 'ingredient' }],
    });

    if (!recipes || !recipes.length) continue;

    // Filter by variant if variant-specific recipe exists, otherwise use base recipe
    let matchedRecipes = recipes.filter(r => r.item_variant_id && String(r.item_variant_id) === String(variantId));
    if (!matchedRecipes.length) {
      matchedRecipes = recipes.filter(r => !r.item_variant_id);
    }

    const foodItem = await Item.findByPk(itemId);
    const dishName = foodItem ? foodItem.item_name : `Dish #${itemId}`;

    for (const line of matchedRecipes) {
      if (!line.ingredient) continue;

      const portionQty = parseFloat(line.quantity || 0);
      const totalToDeduct = portionQty * qtyOrdered;

      if (totalToDeduct <= 0) continue;

      // 1. Decrement inventory stock
      await line.ingredient.decrement('quantity', { by: totalToDeduct });

      // 2. Record immutable stock-out transaction
      await InventoryTransaction.create({
        inventory_item_id: line.ingredient.id,
        user_id: restaurantId,
        type: 'out',
        quantity: totalToDeduct,
        notes: `Recipe auto-deduction: ${qtyOrdered}x "${dishName}" (${reference})`,
      });
    }
  }
}

module.exports = { deductInventoryForOrder };