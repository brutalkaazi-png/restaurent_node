const { User, Branch } = require('../models');
const { verifyPassword, hashPassword } = require('../utils/password');
const { sanitizeString } = require('../utils/stringHelper');
const { relativePathFor } = require('../utils/mediaHelper');

// GET /profile - Display Restaurant & Owner Profile
async function show(req, res) {
  const user = await User.findByPk(req.currentUser.id);
  const branch = await Branch.findOne({
    where: { restaurant_id: user.id, is_active: true },
  });

  return res.render('res/profile', {
    user,
    branch,
    success: req.query.success || null,
    error: req.query.error || null,
  });
}

// POST /profile - Update Restaurant Profile, Branding & Security
async function update(req, res) {
  try {
    const user = await User.findByPk(req.currentUser.id);
    if (!user) return res.redirect('/login');

    const {
      name,
      slug: slugInput,
      email,
      phone,
      address,
      delivery_charge,
      is_deliver,
      pay_first,
      theme_primary_color,
      current_password,
      new_password,
      confirm_password,
    } = req.body;

    // 1. Basic info
    if (name && name.trim()) user.name = name.trim();
    if (phone) user.phone = phone.trim();
    if (address) user.address = address.trim();

    // 2. Slug customization
    if (slugInput && slugInput.trim()) {
      user.slug = sanitizeString(slugInput);
    }

    // 3. Email update validation
    if (email && email.trim() && email.toLowerCase() !== user.email) {
      const cleanEmail = email.toLowerCase().trim();
      const existing = await User.findOne({ where: { email: cleanEmail } });
      if (existing && existing.id !== user.id) {
        return res.redirect('/profile?error=' + encodeURIComponent('That email address is already in use by another account.'));
      }
      user.email = cleanEmail;
    }

    // 4. Restaurant Operations & Delivery
    user.delivery_charge = delivery_charge !== undefined ? parseFloat(delivery_charge) || 0 : user.delivery_charge;
    user.is_deliver = is_deliver === 'on' || is_deliver === '1' || is_deliver === true ? 1 : 0;
    user.pay_first = pay_first === 'on' || pay_first === '1' || pay_first === true;

    // 5. Theme branding
    if (theme_primary_color) {
      user.theme_primary_color = theme_primary_color;
    }

    // 6. Image / Logo upload
    if (req.files && req.files.logo && req.files.logo[0]) {
      user.logo = relativePathFor(req.files.logo[0], 'images');
    }
    if (req.files && req.files.image && req.files.image[0]) {
      user.image = relativePathFor(req.files.image[0], 'images');
    }

    // 7. Password update (if requested)
    if (new_password) {
      if (!current_password) {
        return res.redirect('/profile?error=' + encodeURIComponent('Current password is required to set a new password.'));
      }
      const matches = await verifyPassword(current_password, user.password);
      if (!matches) {
        return res.redirect('/profile?error=' + encodeURIComponent('Current password entered is incorrect.'));
      }
      if (new_password.length < 6) {
        return res.redirect('/profile?error=' + encodeURIComponent('New password must be at least 6 characters.'));
      }
      if (new_password !== confirm_password) {
        return res.redirect('/profile?error=' + encodeURIComponent('New password and confirmation do not match.'));
      }
      user.password = await hashPassword(new_password);
    }

    await user.save();
    return res.redirect('/profile?success=' + encodeURIComponent('Profile and restaurant settings updated successfully!'));
  } catch (err) {
    console.error('Profile update error:', err);
    return res.redirect('/profile?error=' + encodeURIComponent(err.message || 'Error updating profile.'));
  }
}

module.exports = { show, update };