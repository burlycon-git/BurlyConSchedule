const FlexibleShift = require("../models/FlexibleShift");
const User = require("../models/User");
const ShiftRole = require("../models/ShiftRole");
const { getActiveEvent } = require("../utils/getActiveEvent");

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

    // If this role requires acknowledgment, enforce it server-side.
    const roleDoc = await ShiftRole.findOne({ name: shift.role });
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

    // Clear any acknowledgment snapshot for this user too.
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

module.exports = {
  getUserFlexShifts,
  getAllFlexShifts,
  getShiftsByDate,
  createFlexShift,
  signUpForFlexShift,
  cancelFlexShift,
  deleteFlexShift,
  updateFlexShift
};