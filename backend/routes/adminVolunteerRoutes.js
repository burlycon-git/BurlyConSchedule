const express = require("express");
const router = express.Router();
const {
  getVolunteers,
  getUserPhone,
  listShiftNotifications,
  listContactMessages,
  resolveContactMessage
} = require("../controllers/adminVolunteerController");
const {
  listRoleRequestsForRole,
  listApprovedVolunteersForRole,
  approveRoleRequest,
  denyRoleRequest
} = require("../controllers/roleRequestController");
const authenticateUser = require("../middleware/authMiddleware");

// Local Lead/Admin gate, same as the one in userRoutes.js (checks
// req.user.faRoles, set by authMiddleware -- see the comment there for why
// it's faRoles and not req.user.roles). Not extracted to a shared file yet;
// if you add a third copy of this, pull it into its own middleware module.
const requireLeadOrAdmin = (req, res, next) => {
  const roles = req.user?.faRoles || [];
  if (roles.includes("Admin") || roles.includes("Lead")) return next();
  return res.status(403).json({ error: "forbidden" });
};

// Contact Coordinator messages are gated on the "VolunteerCoordinator"
// FusionAuth application role ONLY -- deliberately not "or Admin" like the
// gate above. In this org, Admin is given out broadly enough (Lead/Admin
// overlap too much to bother distinguishing) that an Admin-or exception
// here would mean "basically everyone," defeating the point of a
// VC-specific inbox. If you want a given Admin to see these, give them the
// VolunteerCoordinator role too -- don't change this check.
// Create that role in FusionAuth, assign it on a user's registration for
// this application, and have them log back in (roles are baked into the
// JWT at login, not checked live) before this will recognize them.
const requireVolunteerCoordinator = (req, res, next) => {
  const roles = req.user?.faRoles || [];
  if (roles.includes("VolunteerCoordinator")) return next();
  return res.status(403).json({ error: "forbidden" });
};

// NOTE: these two existing routes have no auth middleware at all -- that's
// a pre-existing gap in this file, not something introduced here. Worth
// fixing separately, but changing it now would be a bigger, riskier change
// than this notification/contact-message feature calls for.
router.get("/volunteers", getVolunteers);
router.get("/users/:id/phone", getUserPhone);

// Admin: every shift-change notification ever sent, with acknowledgment
// status, unacknowledged-first. This is the "who hasn't seen this, let me
// follow up" view.
router.get("/notifications", authenticateUser, requireLeadOrAdmin, listShiftNotifications);

// Volunteer Coordinator only: volunteer-submitted Contact Coordinator
// messages. ?status=new to see only what still needs attention.
router.get("/contact-messages", authenticateUser, requireVolunteerCoordinator, listContactMessages);
router.patch("/contact-messages/:id/resolve", authenticateUser, requireVolunteerCoordinator, resolveContactMessage);

// Lead/Admin: no extra per-role scoping -- approval rights match who can
// already view that role's AdminRoleView page today. See the discussion in
// the conversation history for why ("everyone's Admin anyway" / no real
// per-role ownership field exists yet).
router.get("/roles/:roleName/role-requests", authenticateUser, requireLeadOrAdmin, listRoleRequestsForRole);
router.get("/roles/:roleName/approved-volunteers", authenticateUser, requireLeadOrAdmin, listApprovedVolunteersForRole);
router.post("/role-requests/:id/approve", authenticateUser, requireLeadOrAdmin, approveRoleRequest);
router.post("/role-requests/:id/deny", authenticateUser, requireLeadOrAdmin, denyRoleRequest);

module.exports = router;