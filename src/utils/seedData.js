const bcrypt = require('bcryptjs');
const {
  User,
  Branch,
  RestaurantTable,
  Category,
  Item,
  ItemVariant,
  Topping,
  Subscription,
  UserSubscription,
  MenuTemplate,
} = require('../models');

async function seedDatabaseIfNeeded() {
  try {
    const existingCount = await User.count();
    if (existingCount > 0) {
      return;
    }

    console.log('[Seed] Seeding demo restaurant data...');
    const now = new Date();
    const nextYear = new Date();
    nextYear.setFullYear(now.getFullYear() + 1);

    const demoPasswordHash = await bcrypt.hash('password123', 10);

    // 1. Restaurant Owner
    const owner = await User.create({
      name: 'Demo Restaurant',
      slug: 'demo-restaurant',
      email: 'demo.owner@restaurant.local',
      password: demoPasswordHash,
      user_type: 'R',
      status: 'approved',
      pay_first: false,
      del_status: 0,
      delivery_charge: 5,
      image: 'assets/demo/restaurant/mark.svg',
      logo: 'assets/demo/restaurant/mark.svg',
    });

    // 2. Main Branch
    const branch = await Branch.create({
      restaurant_id: owner.id,
      name: 'Main Branch',
      slug: 'main',
      is_active: true,
    });

    // 3. Superadmin
    await User.create({
      name: 'Demo Superadmin',
      slug: 'demo-superadmin',
      email: 'demo.superadmin@restaurant.local',
      password: demoPasswordHash,
      user_type: 'S',
      status: 'approved',
      del_status: 0,
    });

    // 4. Staff Users
    await User.create({
      name: 'Demo Kitchen Staff',
      slug: 'demo-kitchen',
      email: 'demo.kitchen@restaurant.local',
      password: demoPasswordHash,
      user_type: 'K',
      waiter_id: owner.id,
      status: 'approved',
      del_status: 0,
    });

    await User.create({
      name: 'Demo Counter Staff',
      slug: 'demo-counter',
      email: 'demo.counter@restaurant.local',
      password: demoPasswordHash,
      user_type: 'Co',
      waiter_id: owner.id,
      status: 'approved',
      del_status: 0,
    });

    await User.create({
      name: 'Demo Waiter',
      slug: 'demo-waiter',
      email: 'demo.waiter@restaurant.local',
      password: demoPasswordHash,
      user_type: 'R',
      user_role: 'waiter',
      waiter_id: owner.id,
      status: 'approved',
      del_status: 0,
    });

    await User.create({
      name: 'Demo Customer',
      slug: 'demo-customer',
      email: 'demo.customer@restaurant.local',
      password: demoPasswordHash,
      user_type: 'C',
      status: 'approved',
      del_status: 0,
    });

    // 5. Tables
    for (let i = 1; i <= 5; i++) {
      await RestaurantTable.create({
        restaurant_id: owner.id,
        branch_id: branch.id,
        table_name: `Table ${i}`,
        table_slug: `demo-table-${i}`,
        table_token: `demo-table-${i}-token`,
        status: 'available',
        is_virtual: false,
      });
    }

    // 6. Categories
    const starters = await Category.create({
      user_id: owner.id,
      branch_id: branch.id,
      category_name: 'Starters',
      category_description: 'Fresh dishes to begin your meal.',
      category_image: 'assets/demo/categories/starters.svg',
      category_order: 1,
    });

    const drinks = await Category.create({
      user_id: owner.id,
      branch_id: branch.id,
      category_name: 'Drinks',
      category_description: 'Cold and hot beverages.',
      category_image: 'assets/demo/categories/drinks.svg',
      category_order: 2,
    });

    // 7. Menu Items
    const springRolls = await Item.create({
      user_id: owner.id,
      branch_id: branch.id,
      item_name: 'Spring Rolls',
      item_slug: 'demo-spring-rolls',
      item_description: 'Crisp vegetable spring rolls with sweet chili dip.',
      item_image: 'assets/demo/items/spring-rolls.svg',
      item_category: starters.id,
      price: 10.0,
      has_variants: true,
      has_toppings: true,
      item_order: 1,
    });

    await ItemVariant.create({
      item_id: springRolls.id,
      name: 'Regular',
      price: 10.0,
    });
    await ItemVariant.create({
      item_id: springRolls.id,
      name: 'Large',
      price: 14.0,
    });

    await Topping.create({
      item_id: springRolls.id,
      name: 'Extra Sauce',
      price: 1.5,
    });

    await Item.create({
      user_id: owner.id,
      branch_id: branch.id,
      item_name: 'Iced Tea',
      item_slug: 'demo-iced-tea',
      item_description: 'Freshly brewed lemon iced tea with mint.',
      item_image: 'assets/demo/items/iced-tea.svg',
      item_category: drinks.id,
      price: 4.5,
      is_drink: true,
      item_order: 1,
    });

    // 8. Subscription & Menu Template
    const sub = await Subscription.create({
      name: 'Standard Plan',
      subscription_type: 'monthly',
      month: '1',
      cost: '49',
      del_status: 0,
    });

    await UserSubscription.create({
      user_id: owner.id,
      subscription_id: sub.id,
      payment_status: 'paid',
      subscription_status: 'active',
      subscription_start_date: now,
      subscription_end_date: nextYear,
    });

    await MenuTemplate.create({
      user_id: owner.id,
      branch_id: branch.id,
      template_id: 1,
      show_product_image: 1,
      show_category_image: 1,
    });

    console.log('[Seed] Demo restaurant data seeded successfully.');
  } catch (error) {
    console.error('[Seed] Error seeding demo data:', error.message);
  }
}

module.exports = { seedDatabaseIfNeeded };
