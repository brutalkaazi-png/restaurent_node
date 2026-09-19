'use strict';

const bcrypt = require('bcryptjs');

const demoEmail = 'demo.owner@restaurant.local';
const demoPassword = 'password123';
const demoEmailFor = (role, index) =>
  index === 1 ? `demo.${role}@restaurant.local` : `demo.${role}.${index}@restaurant.local`;
const kitchenEmails = Array.from({ length: 5 }, (_, index) => demoEmailFor('kitchen', index + 1));
const counterEmails = Array.from({ length: 5 }, (_, index) => demoEmailFor('counter', index + 1));
const waiterEmails = Array.from({ length: 5 }, (_, index) => demoEmailFor('waiter', index + 1));
const customerEmails = Array.from({ length: 5 }, (_, index) => demoEmailFor('customer', index + 1));
const seededEmails = [
  demoEmail,
  'demo.superadmin@restaurant.local',
  ...kitchenEmails,
  ...counterEmails,
  ...waiterEmails,
  ...customerEmails,
];

/** @type {import('sequelize-cli').Migration} */
module.exports = {
  async up(queryInterface) {
    const now = new Date();

    const [existingOwners] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email: demoEmail } }
    );
    if (!existingOwners.length) {
      await queryInterface.bulkInsert('users', [
        {
          name: 'Demo Restaurant',
          slug: 'demo-restaurant',
          email: demoEmail,
          password: await bcrypt.hash(demoPassword, 10),
          user_type: 'R',
          status: 'approved',
          pay_first: false,
          del_status: 0,
          created_at: now,
          updated_at: now,
        },
      ]);
    }

    const [owners] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email: demoEmail } }
    );
    const ownerId = owners[0].id;
    await queryInterface.bulkUpdate(
      'users',
      { image: 'assets/demo/restaurant/mark.svg', logo: 'assets/demo/restaurant/mark.svg', updated_at: now },
      { id: ownerId }
    );
    const [branches] = await queryInterface.sequelize.query(
      'SELECT id FROM branches WHERE restaurant_id = :ownerId AND slug = :slug LIMIT 1',
      { replacements: { ownerId, slug: 'main' } }
    );
    let branchId = branches[0]?.id;
    if (!branchId) {
      await queryInterface.bulkInsert('branches', [{ restaurant_id: ownerId, name: 'Main Branch', slug: 'main', is_active: true, created_at: now, updated_at: now }]);
      const [createdBranches] = await queryInterface.sequelize.query(
        'SELECT id FROM branches WHERE restaurant_id = :ownerId AND slug = :slug LIMIT 1',
        { replacements: { ownerId, slug: 'main' } }
      );
      branchId = createdBranches[0].id;
    }

    const passwordHash = await bcrypt.hash(demoPassword, 10);
    const staffUsers = [
      {
        name: 'Demo Superadmin',
        email: 'demo.superadmin@restaurant.local',
        password: passwordHash,
        user_type: 'S',
        status: 'approved',
        del_status: 0,
        created_at: now,
        updated_at: now,
      },
      ...kitchenEmails.map((email, index) => ({
        name: `Demo Kitchen Staff ${index + 1}`,
        email,
        password: passwordHash,
        user_type: 'K',
        waiter_id: ownerId,
        status: 'approved',
        del_status: 0,
        created_at: now,
        updated_at: now,
      })),
      ...counterEmails.map((email, index) => ({
        name: `Demo Counter Staff ${index + 1}`,
        email,
        password: passwordHash,
        user_type: 'Co',
        waiter_id: ownerId,
        status: 'approved',
        del_status: 0,
        created_at: now,
        updated_at: now,
      })),
      ...waiterEmails.map((email, index) => ({
        name: `Demo Waiter ${index + 1}`,
        email,
        password: passwordHash,
        user_type: 'R',
        user_role: 'waiter',
        waiter_id: ownerId,
        status: 'approved',
        del_status: 0,
        created_at: now,
        updated_at: now,
      })),
      ...customerEmails.map((email, index) => ({
        name: `Demo Customer ${index + 1}`,
        email,
        password: passwordHash,
        user_type: 'C',
        status: 'approved',
        del_status: 0,
        created_at: now,
        updated_at: now,
      })),
    ];

    const [existingStaff] = await queryInterface.sequelize.query(
      'SELECT email FROM users WHERE email IN (:emails)',
      { replacements: { emails: staffUsers.map((user) => user.email) } }
    );
    const existingStaffEmails = new Set(existingStaff.map((user) => user.email));
    const missingStaffUsers = staffUsers.filter((user) => !existingStaffEmails.has(user.email));
    if (missingStaffUsers.length) await queryInterface.bulkInsert('users', missingStaffUsers);

    const tables = Array.from({ length: 5 }, (_, index) => ({
      restaurant_id: ownerId,
      branch_id: branchId,
      table_name: `Table ${index + 1}`,
      table_slug: `demo-table-${index + 1}`,
      table_token: `demo-table-${index + 1}-token`,
      status: 'available',
      is_virtual: false,
      created_at: now,
      updated_at: now,
    }));
    const [existingTables] = await queryInterface.sequelize.query(
      'SELECT table_slug FROM restaurant_tables WHERE restaurant_id = :ownerId AND table_slug IN (:slugs)',
      { replacements: { ownerId, slugs: tables.map((table) => table.table_slug) } }
    );
    const existingTableSlugs = new Set(existingTables.map((table) => table.table_slug));
    const missingTables = tables.filter((table) => !existingTableSlugs.has(table.table_slug));
    if (missingTables.length) await queryInterface.bulkInsert('restaurant_tables', missingTables);

    const categoriesToSeed = [
      {
        user_id: ownerId,
        branch_id: branchId,
        category_name: 'Starters',
        category_description: 'Fresh dishes to begin your meal.',
        category_image: 'assets/demo/categories/starters.svg',
        category_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        user_id: ownerId,
        branch_id: branchId,
        category_name: 'Drinks',
        category_description: 'Cold and hot beverages.',
        category_image: 'assets/demo/categories/drinks.svg',
        category_order: 2,
        created_at: now,
        updated_at: now,
      },
    ];
    const [existingCategories] = await queryInterface.sequelize.query(
      'SELECT category_name FROM categories WHERE user_id = :ownerId AND category_name IN (:names)',
      { replacements: { ownerId, names: categoriesToSeed.map((category) => category.category_name) } }
    );
    const existingCategoryNames = new Set(existingCategories.map((category) => category.category_name));
    const missingCategories = categoriesToSeed.filter((category) => !existingCategoryNames.has(category.category_name));
    if (missingCategories.length) await queryInterface.bulkInsert('categories', missingCategories);
    for (const category of categoriesToSeed) {
      await queryInterface.bulkUpdate(
        'categories',
        { category_image: category.category_image, updated_at: now },
        { user_id: ownerId, category_name: category.category_name }
      );
    }

    const [categories] = await queryInterface.sequelize.query(
      'SELECT id, category_name FROM categories WHERE user_id = :ownerId',
      { replacements: { ownerId } }
    );
    const categoryId = Object.fromEntries(categories.map((category) => [category.category_name, category.id]));

    const itemsToSeed = [
      {
        user_id: ownerId,
        branch_id: branchId,
        item_name: 'Spring Rolls',
        item_slug: 'demo-spring-rolls',
        item_description: 'Crisp vegetable spring rolls.',
        item_image: 'assets/demo/items/spring-rolls.svg',
        item_category: categoryId.Starters,
        price: 10.0,
        has_variants: true,
        has_toppings: true,
        item_order: 1,
        created_at: now,
        updated_at: now,
      },
      {
        user_id: ownerId,
        branch_id: branchId,
        item_name: 'Iced Tea',
        item_slug: 'demo-iced-tea',
        item_description: 'Freshly brewed lemon iced tea.',
        item_image: 'assets/demo/items/iced-tea.svg',
        item_category: categoryId.Drinks,
        price: 4.5,
        is_drink: true,
        item_order: 1,
        created_at: now,
        updated_at: now,
      },
    ];
    const [existingItems] = await queryInterface.sequelize.query(
      'SELECT item_slug FROM items WHERE user_id = :ownerId AND item_slug IN (:slugs)',
      { replacements: { ownerId, slugs: itemsToSeed.map((item) => item.item_slug) } }
    );
    const existingItemSlugs = new Set(existingItems.map((item) => item.item_slug));
    const missingItems = itemsToSeed.filter((item) => !existingItemSlugs.has(item.item_slug));
    if (missingItems.length) await queryInterface.bulkInsert('items', missingItems);
    for (const item of itemsToSeed) {
      await queryInterface.bulkUpdate(
        'items',
        { item_image: item.item_image, updated_at: now },
        { user_id: ownerId, item_slug: item.item_slug }
      );
    }

    const [items] = await queryInterface.sequelize.query(
      'SELECT id, item_name FROM items WHERE user_id = :ownerId',
      { replacements: { ownerId } }
    );
    const itemId = Object.fromEntries(items.map((item) => [item.item_name, item.id]));

    const [existingVariants] = await queryInterface.sequelize.query(
      'SELECT id FROM item_variants WHERE item_id = :itemId LIMIT 1',
      { replacements: { itemId: itemId['Spring Rolls'] } }
    );
    if (!existingVariants.length) await queryInterface.bulkInsert('item_variants', [
      { item_id: itemId['Spring Rolls'], name: 'Regular', price: 10.0, created_at: now, updated_at: now },
      { item_id: itemId['Spring Rolls'], name: 'Large', price: 14.0, created_at: now, updated_at: now },
    ]);

    const [existingToppings] = await queryInterface.sequelize.query(
      'SELECT id FROM toppings WHERE item_id = :itemId LIMIT 1',
      { replacements: { itemId: itemId['Spring Rolls'] } }
    );
    if (!existingToppings.length) await queryInterface.bulkInsert('toppings', [
      { item_id: itemId['Spring Rolls'], name: 'Extra Sauce', price: 1.5, created_at: now, updated_at: now },
    ]);
  },

  async down(queryInterface) {
    const [owners] = await queryInterface.sequelize.query(
      'SELECT id FROM users WHERE email = :email LIMIT 1',
      { replacements: { email: demoEmail } }
    );
    if (!owners.length) return;

    const ownerId = owners[0].id;
    const [items] = await queryInterface.sequelize.query(
      'SELECT id FROM items WHERE user_id = :ownerId',
      { replacements: { ownerId } }
    );
    const itemIds = items.map((item) => item.id);

    if (itemIds.length) {
      await queryInterface.bulkDelete('toppings', { item_id: itemIds });
      await queryInterface.bulkDelete('item_variants', { item_id: itemIds });
      await queryInterface.bulkDelete('items', { user_id: ownerId });
    }
    await queryInterface.bulkDelete('categories', { user_id: ownerId });
    await queryInterface.bulkDelete('restaurant_tables', { restaurant_id: ownerId });
    await queryInterface.bulkDelete('users', { waiter_id: ownerId });
    await queryInterface.bulkDelete('users', { email: seededEmails.filter((email) => email !== demoEmail) });
    await queryInterface.bulkDelete('users', { id: ownerId });
  }
};
