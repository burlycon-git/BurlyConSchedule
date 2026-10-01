const User = require("../models/User");

// GET unacknowledged notifications for a volunteer, fetched right after
// login to drive the "Acknowledge" modal. Keyed by fusionAuthId, matching
// how the rest of the volunteer-facing (non-admin) API identifies the
// logged-in user.
const getUnacknowledgedNotifications = async (req, res) => {
  const { userId } = req.params; // fusionAuthId

  try {
    const user = await User.findOne({ fusionAuthId: userId }).select("notifications");
    if (!user) return res.status(404).json({ message: "User not found" });

    const unacknowledged = (user.notifications || [])
      .filter((n) => !n.acknowledgedAt)
      .sort((a, b) => new Date(a.createdAt) - new Date(b.createdAt));

    res.json(unacknowledged);
  } catch (err) {
    res.status(500).json({ message: "Error fetching notifications", error: err.message });
  }
};

// POST acknowledge one notification. The modal's "Acknowledge" button
// calls this per notification; closing the modal happens client-side once
// everything currently shown has been acknowledged.
const acknowledgeNotification = async (req, res) => {
  const { userId, notificationId } = req.params; // userId = fusionAuthId

  try {
    const user = await User.findOne({ fusionAuthId: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const notification = user.notifications.id(notificationId);
    if (!notification) return res.status(404).json({ message: "Notification not found" });

    notification.acknowledgedAt = new Date();
    await user.save();

    res.json({ ok: true, notification });
  } catch (err) {
    res.status(500).json({ message: "Error acknowledging notification", error: err.message });
  }
};

module.exports = {
  getUnacknowledgedNotifications,
  acknowledgeNotification
};