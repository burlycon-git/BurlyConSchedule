const mongoose = require("mongoose");

const flexibleShiftSchema = new mongoose.Schema({
  eventId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: "Event",
    required: true,
    index: true,
  },
  date: {
    type: String,
    required: true
  },
  role: {
    type: String,
    required: true
  },
  startTime: {
    type: String,
    required: true
  },
  endTime: {
    type: String,
    required: true
  },
  volunteersNeeded: {
    type: Number,
    required: true
  },
  volunteersRegistered: [{
    type: mongoose.Schema.Types.ObjectId,
    ref: "User"
  }],
  // Snapshot of who confirmed a role requirement, what they agreed to, and when.
  // Parallel to volunteersRegistered so existing .includes()/.filter() logic is untouched.
  acknowledgments: [{
    user: {
      type: mongoose.Schema.Types.ObjectId,
      ref: "User",
      required: true
    },
    text: {
      type: String,
      default: ""
    },
    acknowledgedAt: {
      type: Date,
      default: Date.now
    }
  }],
  notes: {
    type: String
  },
  reminderSent: {
    type: Boolean,
    default: false
  }
}, { timestamps: true });

module.exports = mongoose.model("FlexibleShift", flexibleShiftSchema);