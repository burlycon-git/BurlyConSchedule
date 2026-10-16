const express = require("express");
const router = express.Router();
const FlexibleShift = require("../models/FlexibleShift");
const ShiftRole = require("../models/ShiftRole");
const { getActiveEvent } = require("../utils/getActiveEvent");

// GET role-by-role stats for the active event
router.get("/role-stats", async (req, res) => {
  try {
    const activeEvent = await getActiveEvent();
    if (!activeEvent) {
      return res.status(400).json({ message: "No active event configured" });
    }

    // Get all defined roles
    const roles = await ShiftRole.find().sort({ name: 1 });

    // Get all shifts for the active event
    const shifts = await FlexibleShift.find({ eventId: activeEvent._id });

    // Build stats per role
    const statsByRole = {};
    shifts.forEach((shift) => {
      const roleName = shift.role || "Unassigned";
      if (!statsByRole[roleName]) {
        statsByRole[roleName] = {
          totalShifts: 0,
          totalCapacity: 0,
          totalFilled: 0,
          totalUnfilled: 0,
          criticalShifts: 0,
        };
      }
const filled = shift.volunteersRegistered?.length || 0;
const needed = shift.volunteersNeeded || 0; // total target headcount

statsByRole[roleName].totalShifts += 1;
statsByRole[roleName].totalCapacity += needed;
statsByRole[roleName].totalFilled += filled;
statsByRole[roleName].totalUnfilled += Math.max(0, needed - filled);
if (needed > 0 && filled === 0) {
  statsByRole[roleName].criticalShifts += 1;
}
    });

    // Merge defined roles with stats (so roles with no shifts still appear)
    const result = roles.map((role) => ({
      roleName: role.name,
      ...(statsByRole[role.name] || {
        totalShifts: 0,
        totalCapacity: 0,
        totalFilled: 0,
        totalUnfilled: 0,
        criticalShifts: 0,
      }),
    }));

    res.json(result);
  } catch (err) {
    console.error("Dashboard stats error:", err);
    res.status(500).json({ message: "Failed to load dashboard stats", error: err.message });
  }
});

module.exports = router;