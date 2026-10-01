const mongoose = require("mongoose");

// One row per "please let me sign up for this restricted role" request.
// Role-level, not shift-level -- a single approval unlocks every shift
// under that role name (matches ShiftRole.restricted / User.approvedRoles).
// A denial doesn't block future requests: re-requesting just creates a new
// row with a fresh "pending" status, leaving the denied row as history.
const roleRequestSchema = new mongoose.Schema(
  {
    user: { type: mongoose.Schema.Types.ObjectId, ref: "User", required: true },
    role: { type: String, required: true }, // matches ShiftRole.name
    status: { type: String, enum: ["pending", "approved", "denied"], default: "pending" },
    decidedAt: { type: Date },
    decidedBy: { type: mongoose.Schema.Types.ObjectId, ref: "User" },
    note: { type: String, maxlength: 500 }
  },
  { timestamps: true }
);

module.exports = mongoose.model("RoleRequest", roleRequestSchema);