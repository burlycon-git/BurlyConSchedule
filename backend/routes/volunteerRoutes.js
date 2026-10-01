const express = require("express");
const router = express.Router();
const FlexibleShift = require("../models/FlexibleShift");


const {
  getUserFlexShifts,
  getAllFlexShifts,
  getShiftsByDate,
  createFlexShift,
  signUpForFlexShift,
  cancelFlexShift,
  deleteFlexShift,
  updateFlexShift,
  removeVolunteerFromShift,
  reassignShiftVolunteers
} = require("../controllers/flexShiftController");

const {
  getUnacknowledgedNotifications,
  acknowledgeNotification
} = require("../controllers/notificationController");

const { submitContactMessage } = require("../controllers/contactController");

const { submitRoleRequest } = require("../controllers/roleRequestController");

// Get user's shifts
router.get("/user/:userId", getUserFlexShifts);

// Get shifts by date
router.get("/:date", getShiftsByDate);

// Public Routes
router.get("/", getAllFlexShifts);

// Volunteer Actions
router.post("/:id/signup", signUpForFlexShift);
router.post("/:id/cancel", cancelFlexShift);

// Volunteer: fetch anything unacknowledged for the login modal, and
// acknowledge one. Both keyed by fusionAuthId, like the rest of the routes
// in this file.
router.get("/notifications/:userId", getUnacknowledgedNotifications);
router.post("/notifications/:userId/:notificationId/acknowledge", acknowledgeNotification);

// Volunteer: submit a message through the in-app Contact Coordinator
// button. Body: { userId: <fusionAuthId>, message, shiftId? }
router.post("/contact-coordinator", submitContactMessage);

// Volunteer: request access to a restricted role (shown as "Request
// Access" in place of "Sign Up" when signup was rejected with
// approvalRequired: true). Idempotent -- safe to call again while a
// request is already pending. Body: { userId: <fusionAuthId>, role }
router.post("/role-requests", submitRoleRequest);

// Admin Actions
router.post("/", createFlexShift);
router.patch("/:id", updateFlexShift);
router.delete("/:id", deleteFlexShift);

// Admin: pull one volunteer off a shift and notify them.
// Body: { userId: <Mongo User _id>, reason?: string }
router.post("/:id/remove-volunteer", removeVolunteerFromShift);

// Admin: move every volunteer on this shift to another shift, notify them,
// and delete this shift. For collapsing a shift that shouldn't have been
// created into an equivalent one.
// Body: { targetShiftId: <FlexibleShift _id> }
router.post("/:id/reassign", reassignShiftVolunteers);

router.post("/seed", async (req, res) => {
  try {
    const testShift = await FlexibleShift.create({
      role: "Hospitality",
      date: "2025-11-07",
      startTime: "10:00",
      endTime: "12:00",
      volunteersNeeded: 3,
      volunteersRegistered: [],
      notes: "Seeded for testing"
    });
    res.json(testShift);
  } catch (err) {
    res.status(500).json({ error: err.message });
  }
});

module.exports = router;