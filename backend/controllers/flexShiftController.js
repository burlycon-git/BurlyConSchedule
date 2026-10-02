const FlexibleShift = require("../models/FlexibleShift");
const User = require("../models/User");
const ShiftRole = require("../models/ShiftRole");
const { getActiveEvent } = require("../utils/getActiveEvent");
const emailService = require("../utils/emailService");
const { ensurePendingRoleRequest } = require("./roleRequestController");

// GET users shifts
const getUserFlexShifts = async (req, res) => {
  try {
    const user = await User.findOne({ fusionAuthId: req.params.userId }).populate({
      path: "volunteerShifts.shift",
      model: "FlexibleShift"
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    const activeEvent = await getActiveEvent();

    // Filter shifts (only those for the active event)
    const shifts = user.volunteerShifts
      .filter((s) => s.shift && s.shift instanceof Object)
      .filter((s) => !activeEvent || String(s.shift.eventId) === String(activeEvent._id))
      .map((s) => ({
        ...s.shift.toObject(),
        status: s.status
      }));

    const hoursForShift = (shift) => {
      const start = new Date(`1970-01-01T${shift.startTime}`);
      let end = new Date(`1970-01-01T${shift.endTime}`);
      if (end < start) end.setDate(end.getDate() + 1);
      return (end - start) / (1000 * 60 * 60);
    };

    // Discount-code gate: hours on a restricted role don't count toward the
    // totalHours the frontend uses for the 8hr/16hr discount thresholds
    // (UserProfile.js) until the volunteer is actually approved for that
    // role -- see ShiftRole.restricted / User.approvedRoles. The shift
    // itself still shows up in their schedule either way; this only affects
    // which hours get summed. Getting approved later makes those hours
    // count retroactively, since this is computed fresh on every request
    // rather than stored.
    const roleNames = [...new Set(shifts.map((s) => s.role))];
    const restrictedRoleDocs = await ShiftRole.find({
      name: { $in: roleNames },
      restricted: true
    }).select("name");
    const restrictedRoleNames = new Set(restrictedRoleDocs.map((r) => r.name));
    const approvedRoles = Array.isArray(user.approvedRoles) ? user.approvedRoles : [];

    let totalHours = 0;
    let pendingApprovalHours = 0;

    for (const shift of shifts) {
      const hours = hoursForShift(shift);
      const needsApproval = restrictedRoleNames.has(shift.role) && !approvedRoles.includes(shift.role);
      // Annotated directly on the shift object (not just summed separately)
      // so the frontend can flag which specific shift is pending without
      // re-deriving restricted/approvedRoles itself -- see UserProfile.js.
      shift.pendingApproval = needsApproval;
      if (needsApproval) {
        pendingApprovalHours += hours;
      } else {
        totalHours += hours;
      }
    }

    res.json({ shifts, totalHours, pendingApprovalHours });
  } catch (err) {
    res.status(500).json({ message: "Error fetching user shifts", error: err.message });
  }
};

// GET all shifts (active event only)
const getAllFlexShifts = async (req, res) => {
  try {
    const activeEvent = await getActiveEvent();
    const query = activeEvent ? { eventId: activeEvent._id } : {};

    const shifts = await FlexibleShift.find(query)
      .populate('volunteersRegistered', 'preferredName email phone fusionAuthId approvedRoles')
      .sort({ date: 1, startTime: 1 });
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ message: "Error fetching shifts", error: err.message });
  }
};

// GET shifts by date (active event only)
const getShiftsByDate = async (req, res) => {
  const { date } = req.params;
  try {
    const activeEvent = await getActiveEvent();
    const query = activeEvent ? { date, eventId: activeEvent._id } : { date };

    const shifts = await FlexibleShift.find(query)
      .populate('volunteersRegistered', 'preferredName email phone fusionAuthId approvedRoles')
      .sort({ startTime: 1 });
    res.json(shifts);
  } catch (err) {
    res.status(500).json({ message: "Error fetching shifts for date", error: err.message });
  }
};

// POST create shift (auto-tag with active event)
const createFlexShift = async (req, res) => {
  try {
    const activeEvent = await getActiveEvent();
    if (!activeEvent) {
      return res.status(400).json({ message: "No active event configured" });
    }

    const shift = new FlexibleShift({ ...req.body, eventId: activeEvent._id });
    await shift.save();
    res.status(201).json(shift);
  } catch (err) {
    res.status(400).json({ message: "Error creating shift", error: err.message });
  }
};

// PATCH shifts
const updateFlexShift = async (req, res) => {
  try {
    const updated = await FlexibleShift.findByIdAndUpdate(
      req.params.id,
      { $set: req.body },
      { new: true, runValidators: true }
    );

    if (!updated) return res.status(404).json({ message: "Shift not found" });
    res.json(updated);
  } catch (err) {
    console.error("updateFlexShift error:", err);
    res.status(500).json({ message: "Server error" });
  }
};

// POST signup
const signUpForFlexShift = async (req, res) => {
  const { userId, acknowledged } = req.body;
  const { id: shiftId } = req.params;

  try {
    const user = await User.findOne({ fusionAuthId: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const shift = await FlexibleShift.findById(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    if (shift.volunteersRegistered.some(id => id.equals(user._id))) {
      return res.status(400).json({ message: "Already signed up" });
    }

    if (shift.volunteersRegistered.length >= shift.volunteersNeeded) {
      return res.status(400).json({ message: "Shift full" });
    }

    const roleDoc = await ShiftRole.findOne({ name: shift.role });

    // Restricted-role gate: this role is only open to volunteers the
    // department owner has pre-approved (see ShiftRole.restricted /
    // User.approvedRoles). This used to hard-reject the signup here and
    // make the volunteer click a separate "Request Access" button
    // afterward. Now it does both in one step: the signup goes through
    // (they're reserved a spot, same as anyone else) and a RoleRequest is
    // filed automatically -- see below, after the shift is saved. The
    // volunteer shows up flagged "Unapproved" in AdminRoleView (same
    // treatment as someone who signed up before the role was restricted),
    // and their hours don't count toward the discount thresholds on their
    // profile (see getUserFlexShifts) until an admin approves them.
    let approvalRequired = false;
    if (roleDoc && roleDoc.restricted) {
      const approvedRoles = Array.isArray(user.approvedRoles) ? user.approvedRoles : [];
      approvalRequired = !approvedRoles.includes(roleDoc.name);
    }

    // If this role requires acknowledgment, enforce it server-side.
    const requiredText = roleDoc && roleDoc.acknowledgmentText
      ? roleDoc.acknowledgmentText.trim()
      : "";

    if (requiredText && acknowledged !== true) {
      return res.status(400).json({
        message: "This role requires acknowledgment before signup",
        acknowledgmentRequired: true,
        acknowledgmentText: requiredText
      });
    }

    shift.volunteersRegistered.push(user._id);

    if (requiredText) {
      shift.acknowledgments.push({
        user: user._id,
        text: requiredText,
        acknowledgedAt: new Date()
      });
    }

    await shift.save();

    await User.findByIdAndUpdate(user._id, {
      $push: {
        volunteerShifts: {
          shift: shift._id,
          refModel: "FlexibleShift",
          status: "registered"
        }
      }
    });

    // File the access request now that the signup itself has succeeded --
    // idempotent, so this is harmless if they already have one pending
    // (e.g. they signed up for a second shift under the same role).
    if (approvalRequired) {
      await ensurePendingRoleRequest(user, roleDoc.name);
    }

    res.json({
      message: "Signed up successfully",
      approvalRequired,
      pointOfContact: approvalRequired ? (roleDoc.pointOfContact || null) : null,
      contactPhone: approvalRequired ? (roleDoc.contactPhone || null) : null
    });
  } catch (err) {
    console.error("🔥 signUpForFlexShift error:", err);
    res.status(500).json({ message: "Error signing up", error: err.message });
  }
};

// POST cancel
const cancelFlexShift = async (req, res) => {
  const { userId } = req.body;
  const { id: shiftId } = req.params;

  try {
    const user = await User.findOne({ fusionAuthId: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const shift = await FlexibleShift.findById(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    shift.volunteersRegistered = shift.volunteersRegistered.filter(
      (id) => !id.equals(user._id)
    );

    if (Array.isArray(shift.acknowledgments)) {
      shift.acknowledgments = shift.acknowledgments.filter(
        (a) => !a.user.equals(user._id)
      );
    }

    await shift.save();

    await User.findByIdAndUpdate(user._id, {
      $pull: { volunteerShifts: { shift: shift._id } }
    });

    res.json({ message: "Shift canceled" });
  } catch (err) {
    res.status(500).json({ message: "Error cancelling shift", error: err.message });
  }
};

// DELETE shift
const deleteFlexShift = async (req, res) => {
  try {
    const shift = await FlexibleShift.findByIdAndDelete(req.params.id);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    await User.updateMany(
      {},
      { $pull: { volunteerShifts: { shift: shift._id } } }
    );

    res.json({ message: "Shift deleted" });
  } catch (err) {
    res.status(500).json({ message: "Error deleting shift", error: err.message });
  }
};

// POST remove a single volunteer from a shift, admin-initiated, with a notice.
// Use for: pulling an unapproved signup off a restricted-role shift, or
// pulling someone off a shift that's going away with no direct replacement.
// Body: { userId: <Mongo User _id>, reason?: string }
const removeVolunteerFromShift = async (req, res) => {
  const { userId, reason } = req.body;
  const { id: shiftId } = req.params;

  try {
    const shift = await FlexibleShift.findById(shiftId);
    if (!shift) return res.status(404).json({ message: "Shift not found" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const wasRegistered = shift.volunteersRegistered.some((id) => id.equals(user._id));
    if (!wasRegistered) {
      return res.status(400).json({ message: "That volunteer is not signed up for this shift" });
    }

    shift.volunteersRegistered = shift.volunteersRegistered.filter(
      (id) => !id.equals(user._id)
    );

    if (Array.isArray(shift.acknowledgments)) {
      shift.acknowledgments = shift.acknowledgments.filter(
        (a) => !a.user.equals(user._id)
      );
    }

    await shift.save();

    await User.findByIdAndUpdate(user._id, {
      $pull: { volunteerShifts: { shift: shift._id } }
    });

    // In-app notice is written unconditionally -- this is the channel of
    // record (see User.notifications), so it doesn't depend on email working,
    // on notificationPrefs, or on an email being on file. Email below is a
    // best-effort bonus on top of it, not the only copy that exists.
    const inAppMessage = emailService.createInAppRemovalMessage({
      role: shift.role,
      date: shift.date,
      startTime: shift.startTime,
      reason: reason || null
    });

    await User.findByIdAndUpdate(user._id, {
      $push: {
        notifications: {
          type: "shift_removed",
          message: inAppMessage,
          relatedShift: shift._id
        }
      }
    });

    let notified = false;
    let notifyError = null;

    if (user.notificationPrefs?.shiftChanges !== "none") {
      if (user.email) {
        const emailResult = await emailService.sendRemovalNotice(user.email, {
          role: shift.role,
          date: shift.date,
          startTime: shift.startTime,
          reason: reason || null
        });
        notified = emailResult.success;
        if (!emailResult.success) notifyError = emailResult.error;
      } else {
        notifyError = "No email on file -- in-app notice still sent";
      }
    }

    res.json({
      message: "Volunteer removed from shift",
      notifiedInApp: true,
      notifiedByEmail: notified,
      notifyError
    });
  } catch (err) {
    res.status(500).json({ message: "Error removing volunteer", error: err.message });
  }
};

// POST move every volunteer on one shift to another, then delete the
// original. Use for: a shift was created by mistake and needs to collapse
// into an equivalent one instead of just vanishing on the volunteers signed
// up for it.
// Body: { targetShiftId: <FlexibleShift _id> }
const reassignShiftVolunteers = async (req, res) => {
  const { id: sourceShiftId } = req.params;
  const { targetShiftId } = req.body;

  try {
    const sourceShift = await FlexibleShift.findById(sourceShiftId);
    if (!sourceShift) return res.status(404).json({ message: "Source shift not found" });

    const targetShift = await FlexibleShift.findById(targetShiftId);
    if (!targetShift) return res.status(404).json({ message: "Target shift not found" });

    if (sourceShift._id.equals(targetShift._id)) {
      return res.status(400).json({ message: "Source and target shift must differ" });
    }

    const volunteerIds = [...sourceShift.volunteersRegistered];
    const moved = [];
    const skipped = [];

    for (const volunteerId of volunteerIds) {
      const user = await User.findById(volunteerId);
      if (!user) {
        skipped.push({ volunteerId, reason: "user_not_found" });
        continue;
      }

      const alreadyOnTarget = targetShift.volunteersRegistered.some((id) => id.equals(user._id));
      if (alreadyOnTarget) {
        skipped.push({ volunteerId, reason: "already_on_target" });
        continue;
      }

      // Intentionally NOT enforcing volunteersNeeded capacity here -- these
      // volunteers already had a commitment on the calendar; bumping them
      // into "over capacity" on the target is a lesser problem than silently
      // dropping them. The response below reports the new headcount so an
      // admin can see it and adjust volunteersNeeded if needed.
      targetShift.volunteersRegistered.push(user._id);

      await User.findOneAndUpdate(
        { _id: user._id, "volunteerShifts.shift": sourceShift._id },
        { $set: { "volunteerShifts.$.shift": targetShift._id } }
      );

      // Same as removeVolunteerFromShift: the in-app notice is written
      // unconditionally and is the channel of record, independent of email
      // outcome or notificationPrefs.
      const inAppMessage = emailService.createInAppShiftChangeMessage({
        oldRole: sourceShift.role,
        newRole: targetShift.role,
        newDate: targetShift.date,
        newStartTime: targetShift.startTime
      });

      await User.findByIdAndUpdate(user._id, {
        $push: {
          notifications: {
            type: "shift_reassigned",
            message: inAppMessage,
            relatedShift: targetShift._id
          }
        }
      });

      let notified = false;
      let notifyError = null;

      if (user.notificationPrefs?.shiftChanges !== "none") {
        if (user.email) {
          const emailResult = await emailService.sendShiftChangeNotice(user.email, {
            oldRole: sourceShift.role,
            newRole: targetShift.role,
            newDate: targetShift.date,
            newStartTime: targetShift.startTime
          });
          notified = emailResult.success;
          if (!emailResult.success) notifyError = emailResult.error;
        } else {
          notifyError = "No email on file -- in-app notice still sent";
        }
      }

      moved.push({ volunteerId, notifiedInApp: true, notifiedByEmail: notified, notifyError });
    }

    await targetShift.save();
    await FlexibleShift.findByIdAndDelete(sourceShift._id);

    // Belt-and-suspenders: clear out any lingering reference to the deleted
    // shift (e.g. a skipped duplicate) so no User points at a shift that no
    // longer exists.
    await User.updateMany(
      {},
      { $pull: { volunteerShifts: { shift: sourceShift._id } } }
    );

    res.json({
      message: `Moved ${moved.length} volunteer(s) to the target shift and removed the original`,
      moved,
      skipped,
      targetShiftId: targetShift._id,
      targetHeadcount: targetShift.volunteersRegistered.length,
      targetVolunteersNeeded: targetShift.volunteersNeeded
    });
  } catch (err) {
    res.status(500).json({ message: "Error reassigning shift", error: err.message });
  }
};

module.exports = {
  getUserFlexShifts,
  getAllFlexShifts,
  getShiftsByDate,
  createFlexShift,
  signUpForFlexShift,
  cancelFlexShift,
  deleteFlexShift,
  updateFlexShift,
  removeVolunteerFromShift,
  reassignShiftVolunteers
};