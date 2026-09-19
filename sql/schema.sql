-- Schema for the tables used by the ported module (auth + dine-in ordering).
-- This is the *flattened* result of the relevant Laravel migrations in
-- database/migrations/*.php (base create_*_table + every later add_*
-- migration for that table), reconstructed by reading them directly since
-- `php artisan migrate` could not be run in this environment (no access to
-- packagist.org to install Laravel's own dependencies).
--
-- Tables NOT included here (inventory, promotions, discounts, subscriptions
-- billing detail, contacts, templates, etc.) still need their migrations
-- flattened the same way before those modules are ported.

CREATE TABLE IF NOT EXISTS users (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NULL,
  slug VARCHAR(255) NULL,
  email VARCHAR(255) NOT NULL UNIQUE,
  address VARCHAR(255) NULL,
  otp VARCHAR(255) NULL,
  city VARCHAR(255) NULL,
  location VARCHAR(255) NULL,
  latlng VARCHAR(255) NULL,
  phone VARCHAR(255) NULL,
  user_type VARCHAR(255) NULL,
  user_role VARCHAR(255) NULL,
  waiter_id BIGINT UNSIGNED NULL,
  image VARCHAR(255) NULL,
  logo VARCHAR(255) NULL,
  restaurant_type VARCHAR(255) NULL,
  remark TEXT NULL,
  is_deliver INT DEFAULT 0,
  card_payment INT DEFAULT 0,
  secret_key VARCHAR(255) NULL,
  public_key VARCHAR(255) NULL,
  pay_first BOOLEAN DEFAULT FALSE,
  counter_auto_clear BOOLEAN DEFAULT FALSE,
  email_verified_at TIMESTAMP NULL,
  password VARCHAR(255) NULL,
  status VARCHAR(255) NULL,
  del_status INT DEFAULT 0,
  delivery_charge INT DEFAULT 0,
  visiting_card_color VARCHAR(255) NULL,
  visiting_card_title_color VARCHAR(255) NULL,
  visiting_card_info_color VARCHAR(255) NULL,
  theme_primary_color VARCHAR(255) NULL,
  theme_secondary_color VARCHAR(255) NULL,
  theme_heading_text_color VARCHAR(255) NULL,
  theme_background_color VARCHAR(255) NULL,
  theme_outer_background_color VARCHAR(255) NULL,
  theme_accent_color VARCHAR(255) NULL,
  remember_token VARCHAR(100) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (waiter_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS districts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS branches (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  slug VARCHAR(255) NOT NULL,
  is_active BOOLEAN DEFAULT TRUE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  UNIQUE KEY branches_restaurant_slug (restaurant_id, slug),
  FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE
);

CREATE TABLE IF NOT EXISTS settings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  option_name VARCHAR(255) NULL,
  option_value VARCHAR(255) NULL,
  del_status INT DEFAULT 0,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS categories (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NULL,
  category_name VARCHAR(255) NULL,
  category_description TEXT NULL,
  category_order INT NULL,
  category_image VARCHAR(255) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NULL,
  item_name VARCHAR(255) NULL,
  item_slug VARCHAR(255) NULL,
  item_description TEXT NULL,
  item_category BIGINT UNSIGNED NULL,
  price DECIMAL(8,2) NULL,
  is_drink BOOLEAN DEFAULT FALSE,
  sold_out BOOLEAN DEFAULT FALSE,
  has_variants BOOLEAN DEFAULT FALSE,
  has_toppings BOOLEAN DEFAULT FALSE,
  item_image VARCHAR(255) NULL,
  item_order INT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (item_category) REFERENCES categories(id)
);

CREATE TABLE IF NOT EXISTS item_variants (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NULL,
  price DECIMAL(8,2) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS toppings (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  item_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NULL,
  price DECIMAL(8,2) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS restaurant_tables (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NULL,
  table_name VARCHAR(255) NULL,
  table_slug VARCHAR(255) NULL,
  status VARCHAR(255) NULL,
  table_token VARCHAR(255) NULL,
  is_virtual BOOLEAN DEFAULT FALSE,
  owner_session_id VARCHAR(255) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (restaurant_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id)
);

CREATE TABLE IF NOT EXISTS reservations (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  table_id BIGINT UNSIGNED NULL,
  customer_name VARCHAR(255) NOT NULL,
  customer_phone VARCHAR(255) NULL,
  customer_email VARCHAR(255) NULL,
  guest_count INT NOT NULL,
  starts_at DATETIME NOT NULL,
  ends_at DATETIME NOT NULL,
  notes TEXT NULL,
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL,
  INDEX reservations_branch_time (branch_id, starts_at, ends_at)
);

CREATE TABLE IF NOT EXISTS customer_profiles (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  customer_user_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NOT NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(255) NULL,
  address VARCHAR(255) NULL,
  notes TEXT NULL,
  loyalty_points INT NOT NULL DEFAULT 0,
  visit_count INT NOT NULL DEFAULT 0,
  total_spend DECIMAL(12,2) NOT NULL DEFAULT 0,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (customer_user_id) REFERENCES users(id) ON DELETE SET NULL,
  INDEX customer_profiles_branch_name (branch_id, name)
);

CREATE TABLE IF NOT EXISTS table_customers (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_id BIGINT UNSIGNED NULL,
  item_id BIGINT UNSIGNED NULL,
  item_variant_id BIGINT UNSIGNED NULL,
  quantity INT NULL,
  status VARCHAR(255) NULL,
  payment_mode VARCHAR(255) NULL,
  price VARCHAR(255) NULL,
  time VARCHAR(255) NULL,
  remarks TEXT NULL,
  session_id VARCHAR(255) NULL,
  waiter_id BIGINT UNSIGNED NULL,
  toppings JSON NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (table_id) REFERENCES restaurant_tables(id),
  FOREIGN KEY (item_id) REFERENCES items(id),
  FOREIGN KEY (waiter_id) REFERENCES users(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS table_customers_preorders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  table_id BIGINT UNSIGNED NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  item_variant_id BIGINT UNSIGNED NULL,
  quantity INT NOT NULL,
  price FLOAT NULL,
  status VARCHAR(255) NOT NULL,
  token VARCHAR(255) NULL,
  remarks TEXT NULL,
  toppings JSON NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS orders (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  res_id BIGINT UNSIGNED NULL,
  branch_id BIGINT UNSIGNED NULL,
  table_id BIGINT UNSIGNED NULL,
  name VARCHAR(255) NULL,
  email VARCHAR(255) NULL,
  phone VARCHAR(255) NULL,
  address VARCHAR(255) NULL,
  total_cost FLOAT NULL,
  payment_mode VARCHAR(255) NULL,
  transaction_id VARCHAR(255) NULL,
  delivery_charge FLOAT NULL,
  time VARCHAR(255) NULL,
  delivery_type VARCHAR(255) NULL,
  qr_type VARCHAR(255) NULL,
  source VARCHAR(255) NULL,
  order_status VARCHAR(255) NULL,
  discount FLOAT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (res_id) REFERENCES users(id),
  FOREIGN KEY (branch_id) REFERENCES branches(id),
  FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE SET NULL
);

CREATE TABLE IF NOT EXISTS staff_calls (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  branch_id BIGINT UNSIGNED NOT NULL,
  table_id BIGINT UNSIGNED NOT NULL,
  type VARCHAR(50) NOT NULL DEFAULT 'general',
  status VARCHAR(50) NOT NULL DEFAULT 'pending',
  resolved_at DATETIME NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (restaurant_id) REFERENCES users(id) ON DELETE CASCADE,
  FOREIGN KEY (branch_id) REFERENCES branches(id) ON DELETE CASCADE,
  FOREIGN KEY (table_id) REFERENCES restaurant_tables(id) ON DELETE CASCADE,
  INDEX staff_calls_branch_status (branch_id, status)
);

CREATE TABLE IF NOT EXISTS order_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  order_id BIGINT UNSIGNED NULL,
  item_id BIGINT UNSIGNED NULL,
  item_variant_id BIGINT UNSIGNED NULL,
  variant_name VARCHAR(255) NULL,
  original_price DECIMAL(10,2) NULL,
  price FLOAT NULL,
  discount_percentage DECIMAL(10,2) NULL,
  qty INT NULL,
  total FLOAT NULL,
  remarks TEXT NULL,
  toppings JSON NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (order_id) REFERENCES orders(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS discounts (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  start_time TIME NOT NULL,
  end_time TIME NOT NULL,
  discount_percentage DECIMAL(5,2) NOT NULL,
  days JSON NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (restaurant_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS discount_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  discount_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (discount_id) REFERENCES discounts(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS promotions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  restaurant_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NULL,
  slug VARCHAR(255) NULL,
  start_date DATE NULL,
  end_date DATE NULL,
  start_time TIME NULL,
  end_time TIME NULL,
  is_active VARCHAR(255) DEFAULT 'active',
  days JSON NOT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (restaurant_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS promotion_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  promotion_id BIGINT UNSIGNED NOT NULL,
  item_id BIGINT UNSIGNED NOT NULL,
  offer_price VARCHAR(255) NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (promotion_id) REFERENCES promotions(id),
  FOREIGN KEY (item_id) REFERENCES items(id)
);

CREATE TABLE IF NOT EXISTS inventory_items (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NOT NULL,
  name VARCHAR(255) NOT NULL,
  unit VARCHAR(50) NOT NULL,
  quantity DECIMAL(10,2) DEFAULT 0,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS inventory_transactions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  inventory_item_id BIGINT UNSIGNED NOT NULL,
  user_id BIGINT UNSIGNED NOT NULL,
  type ENUM('in','out') NOT NULL,
  quantity DECIMAL(10,2) NOT NULL,
  price_per_unit DECIMAL(10,2) NULL,
  notes TEXT NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (inventory_item_id) REFERENCES inventory_items(id),
  FOREIGN KEY (user_id) REFERENCES users(id)
);

CREATE TABLE IF NOT EXISTS menu_templates (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  template_id BIGINT UNSIGNED NULL,
  show_product_image BOOLEAN DEFAULT FALSE,
  show_category_image BOOLEAN DEFAULT FALSE,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  name VARCHAR(255) NULL,
  subscription_type VARCHAR(255) NULL,
  month VARCHAR(255) NULL,
  cost VARCHAR(255) NULL,
  image VARCHAR(255) NULL,
  del_status INT DEFAULT 0,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL
);

CREATE TABLE IF NOT EXISTS user_subscriptions (
  id BIGINT UNSIGNED AUTO_INCREMENT PRIMARY KEY,
  user_id BIGINT UNSIGNED NULL,
  subscription_id BIGINT UNSIGNED NULL,
  payment_status VARCHAR(255) NULL,
  subscription_status VARCHAR(255) NULL,
  subscription_start_date DATE NULL,
  subscription_end_date DATE NULL,
  created_at TIMESTAMP NULL,
  updated_at TIMESTAMP NULL,
  FOREIGN KEY (user_id) REFERENCES users(id),
  FOREIGN KEY (subscription_id) REFERENCES subscriptions(id)
);
