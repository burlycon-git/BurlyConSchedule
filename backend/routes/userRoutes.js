const express = require("express");
const router = express.Router();
const { FusionAuthClient } = require('@fusionauth/node-client');

// const {
//   getUserProfile,
//   updateUserProfile,
//   getNotificationHistory
// } = require("../controllers/userController");

const User = require("../models/User");

// set user and role
const authenticateUser = require("../middleware/authMiddleware");

// Reused so granting approval here (an admin approving someone who's
// already signed up, outside the formal RoleRequest flow) notifies the
// volunteer the same way approveRoleRequest does -- in-app notice + best-
// effort email. See roleRequestController for the formal request/approve
// path this mirrors.
const { notifyRoleRequestDecision } = require("../controllers/roleRequestController");

//  role gate
const requireLeadOrAdmin = (req, res, next) => {
  const roles = req.user?.roles || [];
  if (roles.includes("Admin") || roles.includes("Lead")) return next();
  return res.status(403).json({ error: "forbidden" });
};

// Initialize FA client 
const client = new FusionAuthClient(
  process.env.FUSIONAUTH_API_KEY,
  process.env.FUSIONAUTH_DOMAIN
);


// ----- user endpoints -----
// router.get("/:id", authenticateUser, getUserProfile);
// router.patch("/:id", authenticateUser, updateUserProfile);
// router.get("/:id/notifications", authenticateUser, getNotificationHistory);

// PATCH pinned roles (user can update their own)
router.patch("/:id/pinned-roles", authenticateUser, async (req, res, next) => {
  try {
    const { pinnedRoles } = req.body;
    if (!Array.isArray(pinnedRoles)) {
      return res.status(400).json({ error: "pinnedRoles must be an array of strings" });
    }

    const user = await User.findOneAndUpdate(
      { fusionAuthId: req.params.id },
      { $set: { pinnedRoles } },
      { new: true }
    );

    if (!user) return res.status(404).json({ error: "user_not_found" });
    res.json({ ok: true, pinnedRoles: user.pinnedRoles });
  } catch (e) { next(e); }
});

// ----- toggles (Lead/Admin only) -----
router.patch("/:id/noShow", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { noShow: !!req.body.noShow } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: "user_not_found" });
    res.json({ ok: true, user });
  } catch (e) { next(e); }
});

router.patch("/:id/restrict", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $set: { isRestricted: !!req.body.isRestricted } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: "user_not_found" });
    res.json({ ok: true, user });
  } catch (e) { next(e); }
});

// PATCH grant/revoke approval for a restricted ShiftRole (Lead/Admin only).
// Body: { roleName: <ShiftRole.name>, approved: boolean }
// approved: true  -> adds roleName to approvedRoles (addToSet, idempotent)
// approved: false -> removes roleName from approvedRoles (used by
// AdminRoleView's "Revoke" action; see roleRequestController for the
// approve-via-RoleRequest path, which writes approvedRoles directly too).
router.patch("/:id/approved-roles", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const { roleName, approved } = req.body;
    if (!roleName || typeof roleName !== "string") {
      return res.status(400).json({ error: "roleName is required" });
    }

    const update = approved
      ? { $addToSet: { approvedRoles: roleName } }
      : { $pull: { approvedRoles: roleName } };

    const user = await User.findByIdAndUpdate(req.params.id, update, {
      new: true,
      runValidators: true
    });
    if (!user) return res.status(404).json({ error: "user_not_found" });

    // Only notify on a grant, not a revoke -- revoking is silent today (same
    // as before this endpoint existed), matching denyRoleRequest's behavior
    // of not notifying either. Wrapped so a notification hiccup never blocks
    // the approval itself from taking effect.
    let notifyResult = null;
    if (approved) {
      try {
        notifyResult = await notifyRoleRequestDecision(user, roleName, true);
      } catch (notifyErr) {
        console.error("Error notifying volunteer of approval:", notifyErr);
        notifyResult = { notifiedByEmail: false, notifyError: notifyErr.message };
      }
    }

    res.json({ ok: true, approvedRoles: user.approvedRoles, ...(notifyResult || {}) });
  } catch (e) { next(e); }
});

// ----- staff notes (Lead/Admin only) -----
router.post("/:id/notes", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const { text, visibility = "lead", category = "general" } = req.body;
    if (!text || !String(text).trim()) return res.status(400).json({ error: "text_required" });

    const note = {
      by: req.user.id,
      byName: req.user.name || req.user.email,
      visibility,
      category,
      text: String(text).trim()
    };

    const user = await User.findByIdAndUpdate(
      req.params.id,
      { $push: { staffNotes: note } },
      { new: true, runValidators: true }
    );
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const added = user.staffNotes[user.staffNotes.length - 1];
    res.json({ ok: true, note: added });
  } catch (e) { next(e); }
});

router.patch("/:id/notes/:noteId", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const n = user.staffNotes.id(req.params.noteId);
    if (!n) return res.status(404).json({ error: "note_not_found" });

    if (req.body.text !== undefined) n.text = String(req.body.text).trim();
    if (req.body.visibility) n.visibility = req.body.visibility;
    if (req.body.category) n.category = req.body.category;

    await user.save();
    res.json({ ok: true, note: n });
  } catch (e) { next(e); }
});

router.delete("/:id/notes/:noteId", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ error: "user_not_found" });

    const n = user.staffNotes.id(req.params.noteId);
    if (!n) return res.status(404).json({ error: "note_not_found" });

    n.deleteOne();
    await user.save();
    res.json({ ok: true });
  } catch (e) { next(e); }
});

// ----- FusionAuth user data (Lead/Admin only) -----
router.get("/:id/fusionauth", authenticateUser, requireLeadOrAdmin, async (req, res, next) => {
  try {
    const response = await client.retrieveUser(req.params.id);
    const user = response.response.user;
    
    res.json({ 
      mobilePhone: user.mobilePhone || null,
      email: user.email,
      firstName: user.firstName,
      lastName: user.lastName
    });
  } catch (error) {
    console.error('Error fetching user from FusionAuth:', error);
    res.status(500).json({ error: 'Failed to retrieve user from FusionAuth' });
  }
});

module.exports = router;