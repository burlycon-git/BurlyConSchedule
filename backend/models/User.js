const mongoose = require("mongoose");

const NoteSchema = new mongoose.Schema(
  {
    by: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    byName: { type: String, required: true },
    visibility: { type: String, enum: ["lead", "admin", "director"], default: "lead" },
    category: { type: String, enum: ["general", "kudos", "concern", "conduct"], default: "general" },
    text: { type: String, required: true, maxlength: 2000 }
  },
  { timestamps: true }
);

// In-app notices for things that happened to this volunteer's schedule
// without their initiating it (removed from a shift, moved to a different
// one). This is the channel of record -- it always gets written, regardless
// of SMS/email outcome -- because SMS can silently fail to reach anyone
// (see fusionAuthService/Twilio notes) and this is how an admin can tell who
// has and hasn't actually seen a change. acknowledgedAt stays null until the
// volunteer clicks "Acknowledge" on the login modal for this specific entry.
const NotificationSchema = new mongoose.Schema(
  {
    type: {
      type: String,
      enum: ["shift_removed", "shift_reassigned", "role_request_approved", "role_request_denied"],
      required: true
    },
    message: { type: String, required: true },
    relatedShift: { type: mongoose.Schema.Types.ObjectId, ref: "FlexibleShift" },
    acknowledgedAt: { type: Date, default: null }
  },
  { timestamps: true }
);

const userSchema = new mongoose.Schema(
  {
    fusionAuthId: { type: String, required: true, unique: true },
    preferredName: String,
    email: { type: String, required: true, unique: true },
    phone: { type: String },

    notificationPrefs: {
      shiftReminders: { type: String, enum: ["sms", "email", "both", "none"], default: "email" },
      shiftChanges:   { type: String, enum: ["sms", "email", "both", "none"], default: "email" },
    },
    pinnedRoles: { type: [String], default: [] },

    // Role names (matching ShiftRole.name) this volunteer has been cleared for.
    // Only consulted when the matching ShiftRole has restricted: true; otherwise
    // ignored. Managed by Lead/Admin via PATCH /api/users/:id/approved-roles.
    approvedRoles: { type: [String], default: [] },

    volunteerShifts: [
      {
        shift: { type: mongoose.Schema.Types.ObjectId, refPath: "volunteerShifts.refModel" },
        refModel: { type: String, enum: ["HourlyNeed", "FlexibleShift"], required: true },
        status: { type: String, enum: ["registered", "no-show"], default: "registered" }
      }
    ],

    totalHours: { type: Number, default: 0 },

    notes: { type: String },

    noShow: { type: Boolean, default: false },
    isRestricted: { type: Boolean, default: false },

    staffNotes: [NoteSchema],

    notifications: [NotificationSchema],

  },
  { timestamps: true }
);

module.exports = mongoose.model("User", userSchema);