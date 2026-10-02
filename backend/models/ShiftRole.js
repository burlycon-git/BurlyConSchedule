const mongoose = require("mongoose");

const shiftRoleSchema = new mongoose.Schema(
  {
    name: {
      type: String,
      required: true,
      unique: true,
      trim: true,
    },
    location: {
      type: String,
      default: "",
    },
    responsibilities: {
      type: String,
      default: "",
    },
    physicalRequirements: {
      type: String,
      default: "",
    },
    pointOfContact: {
      type: String,
      default: "",
    },
    contactPhone: {
      type: String,
      default: "",
    },
    // If non-empty, volunteers must confirm this sentence before signing up.
    // Empty = normal signup, no confirmation step. The text being present IS the toggle.
    acknowledgmentText: {
      type: String,
      default: "",
      trim: true,
    },
    isActive: {
      type: Boolean,
      default: true,
    },
    // When true, this role is only open to volunteers in User.approvedRoles
    // for this role's name. See RoleRequest for the request/approve flow
    // that populates approvedRoles.
    restricted: {
      type: Boolean,
      default: false,
    },
  },
  { timestamps: true }
);

module.exports = mongoose.model("ShiftRole", shiftRoleSchema);