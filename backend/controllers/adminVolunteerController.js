const User = require("../models/User");
const Shift = require("../models/FlexibleShift");
const fusionAuthService = require("../utils/fusionAuthService");
const Event = require("../models/Event");

exports.getVolunteers = async (req, res) => {
  try {
    const showAllTime = req.query.scope === "allTime";

    let shiftQuery = {};
    if (!showAllTime) {
      const activeEvent = await Event.findOne({ isActive: true }).lean();
      if (!activeEvent) {
        return res.status(404).json({ message: "No active event found" });
      }
      shiftQuery = { eventId: activeEvent._id };
    }

    const users = await User.find({}).lean();
    const shifts = await Shift.find(shiftQuery).lean();

    const volunteerData = users.map((user) => {
      const userShifts = shifts.filter((shift) =>
        shift.volunteersRegistered?.some(
          (id) => id.toString() === user._id.toString()
        )
      );

      const totalHours = userShifts.reduce((sum, shift) => {
        const start = new Date(`${shift.date}T${shift.startTime}`);
        let end = new Date(`${shift.date}T${shift.endTime}`);
        if (end <= start) end.setDate(end.getDate() + 1);
        return sum + (end - start) / (1000 * 60 * 60);
      }, 0);

      return {
        id: user._id,
        name: user.preferredName || user.name || "Unnamed Volunteer",
        email: user.email,
        noShow: user.noShow,
        isRestricted: user.isRestricted,
        shifts: userShifts.map((shift) => ({
          id: shift._id,
          role: shift.role,
          date: shift.date,
          startTime: shift.startTime,
          endTime: shift.endTime,
        })),
        totalHours: Math.round(totalHours * 100) / 100,
      };
    });

    // Only show volunteers with shifts in the chosen scope
    const filtered = volunteerData.filter((v) => v.shifts.length > 0);
    res.json(filtered);
  } catch (err) {
    console.error("Error fetching volunteers:", err);
    res.status(500).json({ message: "Server error fetching volunteers" });
  }
};

exports.getUserPhone = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) {
      return res.status(404).json({ error: 'User not found' });
    }

    const result = await fusionAuthService.getUserPhone(user.fusionAuthId);
    
    if (!result.success) {
      return res.status(404).json({ error: result.error });
    }

    res.json({ 
      mobilePhone: result.phone
    });
  } catch (error) {
    console.error('Error fetching user phone:', error);
    res.status(500).json({ error: 'Failed to retrieve user' });
  }
};