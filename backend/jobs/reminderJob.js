const cron = require('node-cron');
const emailService = require('../utils/emailService');

// Import shift model
const Shift = require('../models/FlexibleShift');
const ShiftRole = require('../models/ShiftRole');

class ReminderJob {
  constructor() {
    this.isRunning = false;
  }

  // Start cron job
  start() {
    console.log('Starting daily shift digest job...');

    // Was a per-shift reminder every 15 minutes (SMS-style, ~1hr before
    // each shift). Replaced with a single morning email per volunteer
    // listing everything they're on the hook for that day -- most
    // volunteers work more than one shift, so one 7am digest beats
    // several same-day "starts soon" pings.
    cron.schedule('0 7 * * *', async () => {
      await this.sendDailyDigest();
    });

    console.log('Daily shift digest scheduled for 7:00 AM every day');
  }

  async sendDailyDigest() {
    if (this.isRunning) {
      console.log('Daily shift digest already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log(`Running daily shift digest at ${new Date().toISOString()}`);

    try {
      const today = new Date().toISOString().split('T')[0];
      await this.sendDigestForDate(today);
    } catch (error) {
      console.error('Error in daily shift digest job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async sendDigestForDate(dateStr) {
    try {
      console.log(`Looking for shifts on ${dateStr}`);

      // Populates volunteersRegistered with each User's
      // preferredName/email/notificationPrefs/approvedRoles so this can
      // email them directly and still respect the restricted-role gate.
      const shifts = await Shift.find({
        date: dateStr,
        volunteersRegistered: { $exists: true, $not: { $size: 0 } }
      }).populate('volunteersRegistered', 'preferredName email notificationPrefs approvedRoles')
        .sort({ startTime: 1 });

      if (shifts.length === 0) {
        console.log('No shifts scheduled for today -- nothing to send');
        return;
      }

      console.log(`Found ${shifts.length} shift(s) today across all volunteers`);

      // Cache ShiftRole lookups -- several shifts on a given day likely
      // share a role, and this doubles as the location lookup since
      // FlexibleShift itself has no location field.
      const roleCache = new Map();
      const getRole = async (roleName) => {
        if (roleCache.has(roleName)) return roleCache.get(roleName);
        const roleDoc = await ShiftRole.findOne({ name: roleName }).select('restricted location');
        roleCache.set(roleName, roleDoc);
        return roleDoc;
      };

      // Bucket shifts by volunteer so each person gets one email for the
      // whole day instead of one per shift.
      const shiftsByVolunteer = new Map(); // userId -> { user, shifts: [] }

      for (const shift of shifts) {
        const roleDoc = await getRole(shift.role);
        const restricted = !!roleDoc?.restricted;

        for (const v of shift.volunteersRegistered) {
          if (!v || !v.email || v.notificationPrefs?.shiftReminders === 'none') {
            continue;
          }

          // Same restricted-role gate as signup and the single-shift
          // reminder this replaced -- don't list a shift in the morning
          // digest if the volunteer isn't actually cleared to work it yet.
          if (restricted) {
            const approvedRoles = Array.isArray(v.approvedRoles) ? v.approvedRoles : [];
            if (!approvedRoles.includes(shift.role)) continue;
          }

          const key = String(v._id);
          if (!shiftsByVolunteer.has(key)) {
            shiftsByVolunteer.set(key, { user: v, shifts: [] });
          }
          shiftsByVolunteer.get(key).shifts.push({
            role: shift.role,
            startTime: shift.startTime,
            endTime: shift.endTime,
            location: roleDoc?.location || ''
          });
        }
      }

      const entries = [...shiftsByVolunteer.values()];
      if (entries.length === 0) {
        console.log('No volunteers eligible for a digest today (opted out, no email, or all pending approval)');
        return;
      }

      console.log(`Sending daily digest to ${entries.length} volunteer(s)`);

      const results = await Promise.all(
        entries.map(async ({ user, shifts: userShifts }) => {
          const sortedShifts = [...userShifts].sort((a, b) => a.startTime.localeCompare(b.startTime));
          const result = await emailService.sendDailyShiftsDigest(user.email, {
            volunteerName: user.preferredName,
            shifts: sortedShifts
          });
          return { email: user.email, result };
        })
      );

      const successful = results.filter((r) => r.result.success);
      const failed = results.filter((r) => !r.result.success);

      console.log(`Daily digest results: ${successful.length} sent, ${failed.length} failed`);

      if (failed.length > 0) {
        console.log('Failed digest emails:', failed.map((f) => ({
          email: f.email,
          error: f.result.error
        })));
      }
    } catch (error) {
      console.error('Error sending daily digest:', error);
    }
  }

  // Manual trigger for testing -- sends today's digest right now,
  // regardless of the cron schedule. Kept the same method name since
  // routes/sms.js calls reminderJob.sendTestReminders().
  async sendTestReminders() {
    console.log('Running test daily digest...');
    await this.sendDigestForDate(new Date().toISOString().split('T')[0]);
  }

  // Stop the job
  stop() {
    console.log('Stopping daily shift digest job...');
  }
}

module.exports = new ReminderJob();