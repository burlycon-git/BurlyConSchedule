const mongoose = require("mongoose");

// A message a volunteer sends through the in-app "Contact Volunteer
// Coordinator" button, instead of being handed the coordinator's personal
// phone number. Submitting one also fires an SMS alert to the coordinator
// (see smsService.sendCoordinatorAlert) so it's not purely a "check the
// admin panel and hope" inbox -- but this record is the source of truth,
// with enough context (which shift, if any) that the coordinator isn't
// starting cold.
const contactMessageSchema = new mongoose.Schema(
  {
    fromUser: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    message: { type: String, required: true, maxlength: 2000 },
    relatedShift: { type: mongoose.Schema.Types.ObjectId, ref: "FlexibleShift" },
    status: { type: String, enum: ["new", "resolved"], default: "new" },
    resolvedAt: { type: Date },
    resolvedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" }
  },
  { timestamps: true }
);

module.exports = mongoose.model("ContactMessage", contactMessageSchema);