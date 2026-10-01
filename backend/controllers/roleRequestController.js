const RoleRequest = require("../models/RoleRequest");
const ShiftRole = require("../models/ShiftRole");
const User = require("../models/User");
const emailService = require("../utils/emailService");

// POST volunteer-facing: request access to a restricted role.
// Body: { userId: <fusionAuthId>, role: <ShiftRole.name> }
const submitRoleRequest = async (req, res) => {
  const { userId, role } = req.body;
  if (!role) return res.status(400).json({ message: "role is required" });

  try {
    const user = await User.findOne({ fusionAuthId: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const roleDoc = await ShiftRole.findOne({ name: role });
    if (!roleDoc) return res.status(404).json({ message: "Role not found" });
    if (!roleDoc.restricted) {
      return res.status(400).json({ message: "This role does not require approval" });
    }

    if (Array.isArray(user.approvedRoles) && user.approvedRoles.includes(role)) {
      return res.status(400).json({ message: "Already approved for this role" });
    }

    // Idempotent: clicking "Request Access" twice doesn't create duplicate
    // pending rows. Past denied rows are left alone as history.
    const existingPending = await RoleRequest.findOne({ user: user._id, role, status: "pending" });
    if (existingPending) {
      return res.status(200).json({ message: "Request already pending", roleRequest: existingPending });
    }

    const roleRequest = await RoleRequest.create({ user: user._id, role, status: "pending" });
    res.status(201).json({ message: "Request submitted", roleRequest });
  } catch (err) {
    res.status(500).json({ message: "Error submitting request", error: err.message });
  }
};

// GET admin-facing: requests for a specific role, filtered by status
// (defaults to pending). Used by AdminRoleView's "Pending Access Requests"
// panel.
const listRoleRequestsForRole = async (req, res) => {
  const { roleName } = req.params;
  const { status } = req.query;

  try {
    const query = { role: roleName, status: status || "pending" };
    const requests = await RoleRequest.find(query)
      .populate("user", "preferredName email phone")
      .sort({ createdAt: 1 });
    res.json(requests);
  } catch (err) {
    res.status(500).json({ message: "Error listing role requests", error: err.message });
  }
};

// GET admin-facing: everyone currently approved for a role. Used by
// AdminRoleView's "Currently Approved" panel (with a Revoke action that
// reuses the existing PATCH /api/users/:id/approved-roles endpoint).
const listApprovedVolunteersForRole = async (req, res) => {
  const { roleName } = req.params;
  try {
    const users = await User.find({ approvedRoles: roleName }).select(
      "preferredName email phone"
    );
    res.json(users);
  } catch (err) {
    res.status(500).json({ message: "Error listing approved volunteers", error: err.message });
  }
};

// Shared by approve/deny below. Writes the in-app notice unconditionally
// (channel of record, same as shift removal/reassignment), then attempts
// SMS as a best-effort bonus. Returns the SMS outcome so the route handler
// can report it without duplicating this logic twice.
async function notifyRoleRequestDecision(user, role, approved) {
  const message = approved
    ? emailService.createRoleRequestApprovedMessage({ role })
    : emailService.createRoleRequestDeniedMessage({ role });

  await User.findByIdAndUpdate(user._id, {
    $push: {
      notifications: {
        type: approved ? "role_request_approved" : "role_request_denied",
        message
      }
    }
  });

  if (user.notificationPrefs?.shiftChanges === "none") {
    return { notifiedByEmail: false, notifyError: null };
  }

  if (!user.email) {
    return { notifiedByEmail: false, notifyError: "No email on file -- in-app notice still sent" };
  }

  const emailResult = approved
    ? await emailService.sendRoleRequestApprovedNotice(user.email, { role })
    : await emailService.sendRoleRequestDeniedNotice(user.email, { role });

  return {
    notifiedByEmail: emailResult.success,
    notifyError: emailResult.success ? null : emailResult.error
  };
}

// POST admin-facing: approve a pending request. Grants approvedRoles (the
// thing that actually unlocks signup) and notifies the volunteer.
const approveRoleRequest = async (req, res) => {
  try {
    const roleRequest = await RoleRequest.findById(req.params.id).populate("user");
    if (!roleRequest) return res.status(404).json({ message: "Request not found" });
    if (roleRequest.status !== "pending") {
      return res.status(400).json({ message: `Request is already ${roleRequest.status}` });
    }

    roleRequest.status = "approved";
    roleRequest.decidedAt = new Date();
    roleRequest.decidedBy = req.user?._id || null;
    await roleRequest.save();

    await User.findByIdAndUpdate(roleRequest.user._id, {
      $addToSet: { approvedRoles: roleRequest.role }
    });

    const notifyResult = await notifyRoleRequestDecision(roleRequest.user, roleRequest.role, true);

    res.json({ ok: true, roleRequest, ...notifyResult });
  } catch (err) {
    res.status(500).json({ message: "Error approving request", error: err.message });
  }
};

// POST admin-facing: deny a pending request. Body: { note?: string }
// Does NOT touch approvedRoles. The volunteer can submit a new request
// later -- nothing here blocks that (see submitRoleRequest).
const denyRoleRequest = async (req, res) => {
  try {
    const roleRequest = await RoleRequest.findById(req.params.id).populate("user");
    if (!roleRequest) return res.status(404).json({ message: "Request not found" });
    if (roleRequest.status !== "pending") {
      return res.status(400).json({ message: `Request is already ${roleRequest.status}` });
    }

    roleRequest.status = "denied";
    roleRequest.decidedAt = new Date();
    roleRequest.decidedBy = req.user?._id || null;
    if (req.body?.note) roleRequest.note = String(req.body.note).trim();
    await roleRequest.save();

    const notifyResult = await notifyRoleRequestDecision(roleRequest.user, roleRequest.role, false);

    res.json({ ok: true, roleRequest, ...notifyResult });
  } catch (err) {
    res.status(500).json({ message: "Error denying request", error: err.message });
  }
};

module.exports = {
  submitRoleRequest,
  listRoleRequestsForRole,
  listApprovedVolunteersForRole,
  approveRoleRequest,
  denyRoleRequest
};