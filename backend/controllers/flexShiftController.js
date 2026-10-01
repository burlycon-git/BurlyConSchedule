const FlexibleShift = require("../models/FlexibleShift");
const User = require("../models/User");
const ShiftRole = require("../models/ShiftRole");
const { getActiveEvent } = require("../utils/getActiveEvent");
const fusionAuthService = require("../utils/fusionAuthService");
const smsService = require("../utils/smsService");

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

    const totalHours = shifts.reduce((sum, shift) => {
      const start = new Date(`1970-01-01T${shift.startTime}`);
      let end = new Date(`1970-01-01T${shift.endTime}`);
      if (end < start) end.setDate(end.getDate() + 1);
      const hours = (end - start) / (1000 * 60 * 60);
      return sum + hours;
    }, 0);

    res.json({ shifts, totalHours });
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
      .populate('volunteersRegistered', 'preferredName email fusionAuthId')
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
      .populate('volunteersRegistered', 'preferredName email fusionAuthId')
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
    // User.approvedRoles). Checked before the acknowledgment gate so an
    // unapproved volunteer never even sees the acknowledgment text.
    if (roleDoc && roleDoc.restricted) {
      const approvedRoles = Array.isArray(user.approvedRoles) ? user.approvedRoles : [];
      if (!approvedRoles.includes(roleDoc.name)) {
        return res.status(403).json({
          message: `This role requires approval before signup. Contact ${roleDoc.pointOfContact || "the department lead"} to request access.`,
          approvalRequired: true,
          pointOfContact: roleDoc.pointOfContact || null,
          contactPhone: roleDoc.contactPhone || null
        });
      }
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

    res.json({ message: "Signed up successfully" });
  } catch (err) {
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
    // record (see User.notifications), so it doesn't depend on SMS working,
    // on notificationPrefs, or on a phone number being on file. SMS below is
    // a best-effort bonus on top of it, not the only copy that exists.
    const inAppMessage = smsService.createRemovalMessage({
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
      const phoneResult = await fusionAuthService.getUserPhone(user.fusionAuthId);
      if (phoneResult.success) {
        const smsResult = await smsService.sendRemovalNotice(phoneResult.phone, {
          role: shift.role,
          date: shift.date,
          startTime: shift.startTime,
          reason: reason || null
        });
        notified = smsResult.success;
        if (!smsResult.success) notifyError = smsResult.error;
      } else {
        // Twilio trial accounts can only text numbers you've manually
        // verified (up to 5), so this will fail for most volunteers until
        // the account is upgraded -- that's expected right now, not a bug.
        // The in-app notice above still reached them regardless.
        notifyError = `SMS not sent (prefs: ${user.notificationPrefs?.shiftChanges}): ${phoneResult.error || "no phone on file"}`;
      }
    }

    res.json({
      message: "Volunteer removed from shift",
      notifiedInApp: true,
      notifiedBySms: notified,
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
      // unconditionally and is the channel of record, independent of SMS
      // outcome or notificationPrefs.
      const inAppMessage = smsService.createShiftChangeMessage({
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
        const phoneResult = await fusionAuthService.getUserPhone(user.fusionAuthId);
        if (phoneResult.success) {
          const smsResult = await smsService.sendShiftChangeNotice(phoneResult.phone, {
            oldRole: sourceShift.role,
            newRole: targetShift.role,
            newDate: targetShift.date,
            newStartTime: targetShift.startTime
          });
          notified = smsResult.success;
          if (!smsResult.success) notifyError = smsResult.error;
        } else {
          // Expected on a Twilio trial account for anyone outside your 5
          // verified numbers -- see note in removeVolunteerFromShift.
          notifyError = `SMS not sent (prefs: ${user.notificationPrefs?.shiftChanges}): ${phoneResult.error || "no phone on file"}`;
        }
      }

      moved.push({ volunteerId, notifiedInApp: true, notifiedBySms: notified, notifyError });
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