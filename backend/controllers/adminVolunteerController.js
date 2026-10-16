const User = require("../models/User");
const Shift = require("../models/FlexibleShift");
const fusionAuthService = require("../utils/fusionAuthService");
const Event = require("../models/Event");
const ContactMessage = require("../models/ContactMessage");
const emailService = require("../utils/emailService");

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

// POST email every volunteer signed up (this event) for one department, or
// for everyone. Recipients are resolved server-side -- the browser only says
// which department -- so a client can't make this send to arbitrary
// addresses.
//
// Body: { department: "Hospitality Volunteer" | "all",
//         subject, message, dryRun?: boolean }
//   dryRun: true  -> returns { count } without sending (used by the UI to
//                    show "Goes to N volunteers" before confirming).
//
// Access: Admins can email any department or "all". Leads can only email
// departments they've pinned (User.pinnedRoles).
exports.broadcastToVolunteers = async (req, res) => {
  try {
    const { department = "all", subject, message, dryRun = false } = req.body;

    const activeEvent = await Event.findOne({ isActive: true }).lean();
    if (!activeEvent) {
      return res.status(404).json({ message: "No active event found" });
    }

    const sender = await User.findById(req.user?._id)
      .select("preferredName email pinnedRoles")
      .lean();

    // ADAPT: use however your auth middleware exposes roles on req.user.
    const isAdminUser = Array.isArray(req.user?.roles) && req.user.roles.includes("Admin");

    if (!isAdminUser) {
      const allowed = sender?.pinnedRoles || [];
      if (department === "all" || !allowed.includes(department)) {
        return res
          .status(403)
          .json({ message: "You can only email departments you're responsible for" });
      }
    }

    const shifts = await Shift.find({
      eventId: activeEvent._id,
      ...(department !== "all" && { role: department }),
    })
      .select("volunteersRegistered")
      .lean();

    const ids = [
      ...new Set(shifts.flatMap((s) => (s.volunteersRegistered || []).map(String))),
    ];

    const users = await User.find({
      _id: { $in: ids },
      email: { $nin: [null, ""] },
    })
      .select("preferredName email")
      .lean();

    // De-dupe by email (case-insensitive)
    const seen = new Set();
    const recipients = users
      .filter((u) => {
        const key = u.email.trim().toLowerCase();
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((u) => ({ email: u.email.trim(), name: u.preferredName }));

    if (dryRun) {
      return res.json({ count: recipients.length, department });
    }

    if (!subject?.trim() || !message?.trim()) {
      return res.status(400).json({ message: "Subject and message are required" });
    }
    if (recipients.length === 0) {
      return res.status(400).json({ message: "No recipients for that department" });
    }

    const result = await emailService.sendBroadcast(recipients, {
      subject: subject.trim(),
      message: message.trim(),
      replyTo: sender?.email,
      senderName: sender?.preferredName,
      department,
    });

    console.log(
      `Broadcast by ${sender?.email} to "${department}": ${result.sent} sent, ${result.failed.length} failed`
    );

    res.json({ total: recipients.length, ...result });
  } catch (err) {
    console.error("Error sending broadcast:", err);
    res.status(500).json({ message: "Server error sending broadcast" });
  }
};

// GET a flattened, sorted list of every shift-change notification sent to
// every volunteer, with whether/when they acknowledged it. This is the "who
// hasn't seen this yet, let me call them" view -- unacknowledged entries
// surface first, newest first within each group.
exports.listShiftNotifications = async (req, res) => {
  try {
    const users = await User.find({ "notifications.0": { $exists: true } })
      .select("preferredName email notifications")
      .lean();

    const flattened = [];
    users.forEach((u) => {
      (u.notifications || []).forEach((n) => {
        flattened.push({
          notificationId: n._id,
          userId: u._id,
          volunteerName: u.preferredName || u.email,
          volunteerEmail: u.email,
          type: n.type,
          message: n.message,
          relatedShift: n.relatedShift,
          createdAt: n.createdAt,
          acknowledgedAt: n.acknowledgedAt || null,
        });
      });
    });

    flattened.sort((a, b) => {
      const aUnacked = !a.acknowledgedAt;
      const bUnacked = !b.acknowledgedAt;
      if (aUnacked !== bUnacked) return aUnacked ? -1 : 1;
      return new Date(b.createdAt) - new Date(a.createdAt);
    });

    res.json(flattened);
  } catch (err) {
    console.error("Error listing shift notifications:", err);
    res.status(500).json({ message: "Server error listing notifications" });
  }
};

// GET volunteer-submitted messages from the in-app Contact Coordinator
// button. ?status=new|resolved filters; omitted returns everything,
// newest first.
exports.listContactMessages = async (req, res) => {
  try {
    const { status } = req.query;
    const query = status ? { status } : {};

    const messages = await ContactMessage.find(query)
      .populate("fromUser", "preferredName email phone")
      .populate("relatedShift", "role date startTime endTime")
      .sort({ createdAt: -1 });

    res.json(messages);
  } catch (err) {
    console.error("Error listing contact messages:", err);
    res.status(500).json({ message: "Server error listing contact messages" });
  }
};

// PATCH mark a contact message as resolved/handled.
exports.resolveContactMessage = async (req, res) => {
  try {
    const message = await ContactMessage.findByIdAndUpdate(
      req.params.id,
      {
        $set: {
          status: "resolved",
          resolvedAt: new Date(),
          resolvedBy: req.user?._id || null
        }
      },
      { new: true }
    );
    if (!message) return res.status(404).json({ message: "Message not found" });
    res.json(message);
  } catch (err) {
    console.error("Error resolving contact message:", err);
    res.status(500).json({ message: "Server error resolving contact message" });
  }
};