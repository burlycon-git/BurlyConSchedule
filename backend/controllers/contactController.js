const ContactMessage = require("../models/ContactMessage");
const User = require("../models/User");
const smsService = require("../utils/smsService");

// POST a message from the in-app "Contact Volunteer Coordinator" button.
// This exists specifically so volunteers never see the coordinator's
// personal phone number -- they type a message here, it's logged, and the
// coordinator gets pinged with the actual content (not a blind call).
// Body: { userId: <fusionAuthId>, message: string, shiftId?: <FlexibleShift _id> }
const submitContactMessage = async (req, res) => {
  const { userId, message, shiftId } = req.body;

  if (!message || !String(message).trim()) {
    return res.status(400).json({ message: "message is required" });
  }

  try {
    const user = await User.findOne({ fusionAuthId: userId });
    if (!user) return res.status(404).json({ message: "User not found" });

    const contactMessage = await ContactMessage.create({
      fromUser: user._id,
      message: String(message).trim(),
      relatedShift: shiftId || undefined
    });

    let alerted = false;
    let alertError = null;

    const coordinatorPhone = process.env.COORDINATOR_PHONE;
    if (coordinatorPhone) {
      const smsResult = await smsService.sendCoordinatorAlert(coordinatorPhone, {
        volunteerName: user.preferredName || user.email,
        message: contactMessage.message
        // shiftContext intentionally omitted here -- we'd need to look up
        // the shift's role/date/time to make it readable, and the full
        // message + relatedShift id are already in the admin log. Add a
        // lookup here if you want the shift spelled out in the text itself.
      });
      alerted = smsResult.success;
      if (!smsResult.success) alertError = smsResult.error;
    } else {
      alertError = "COORDINATOR_PHONE is not set -- message was logged but no SMS alert was sent";
    }

    res.status(201).json({ ok: true, contactMessage, alerted, alertError });
  } catch (err) {
    res.status(500).json({ message: "Error submitting message", error: err.message });
  }
};

module.exports = {
  submitContactMessage
};