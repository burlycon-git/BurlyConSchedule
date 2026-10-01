const cron = require('node-cron');
const mongoose = require('mongoose');
const emailService = require('../utils/emailService');

// Import shift model
const Shift = require('../models/FlexibleShift');

class ReminderJob {
  constructor() {
    this.isRunning = false;
  }

  // Start cron job
  start() {
    console.log('Starting shift reminder job...');

    // Run every 15 minutes
    cron.schedule('*/15 * * * *', async () => {
      await this.checkAndSendReminders();
    });

    console.log('Shift reminder job scheduled - runs every 15 minutes');
  }

  async checkAndSendReminders() {
    if (this.isRunning) {
      console.log('Reminder job already running, skipping...');
      return;
    }

    this.isRunning = true;
    console.log(`Checking for shifts needing reminders at ${new Date().toISOString()}`);

    try {
      // Find shifts starting in about an hour
      const shiftsNeedingReminders = await this.findShiftsNeedingReminders();

      if (shiftsNeedingReminders.length === 0) {
        console.log('No shifts need reminders right now');
        return;
      }

      console.log(`Found ${shiftsNeedingReminders.length} shifts needing reminders`);

      // Send reminders for shifts
      for (const shift of shiftsNeedingReminders) {
        await this.sendRemindersForShift(shift);
      }

    } catch (error) {
      console.error('Error in reminder job:', error);
    } finally {
      this.isRunning = false;
    }
  }

  async findShiftsNeedingReminders() {
    try {
      const now = new Date();

      // Calculate 50-70 minutes from now
      const reminderStart = new Date(now.getTime() + 50 * 60 * 1000);
      const reminderEnd = new Date(now.getTime() + 70 * 60 * 1000);

      // Get date
      const today = now.toISOString().split('T')[0];

      // Convert times
      const startTimeMin = this.formatTimeForComparison(reminderStart);
      const startTimeMax = this.formatTimeForComparison(reminderEnd);

      console.log(`Looking for shifts on ${today} between ${startTimeMin} and ${startTimeMax}`);

      // Populates volunteersRegistered with each User's
      // preferredName/email/notificationPrefs so sendRemindersForShift can
      // email them directly -- no FusionAuth phone lookup needed anymore.
      const shifts = await Shift.find({
        date: today,
        startTime: {
          $gte: startTimeMin,
          $lte: startTimeMax
        },
        // Only shifts with volunteers
        volunteersRegistered: { $exists: true, $not: { $size: 0 } },
        // Don't send duplicates
        reminderSent: { $ne: true }
      }).populate('volunteersRegistered', 'preferredName email notificationPrefs');

      console.log(`Query found ${shifts.length} shifts needing reminders`);
      return shifts;

    } catch (error) {
      console.error('Error finding shifts:', error);
      return [];
    }
  }

  async sendRemindersForShift(shift) {
    try {
      console.log(`Processing reminders for shift: ${shift.role} at ${shift.startTime}`);

      const volunteers = shift.volunteersRegistered;
      if (!volunteers || volunteers.length === 0) {
        console.log('No volunteers registered for this shift');
        return;
      }

      // Respect each volunteer's shiftReminders preference, and skip anyone
      // with no email on file.
      const eligibleVolunteers = volunteers.filter(
        (v) => v && v.email && v.notificationPrefs?.shiftReminders !== 'none'
      );

      if (eligibleVolunteers.length === 0) {
        console.log('No volunteers eligible for reminders on this shift (opted out or missing email)');
        await Shift.findByIdAndUpdate(shift._id, { reminderSent: true });
        return;
      }

      // Send reminder emails directly -- no FusionAuth lookup needed, the
      // email is already on the populated User doc.
      const emailPromises = eligibleVolunteers.map(async (v) => {
        const shiftDetails = {
          role: shift.role,
          startTime: shift.startTime,
          endTime: shift.endTime,
          location: shift.location || 'TBD',
          volunteerName: v.preferredName
        };

        const result = await emailService.sendShiftReminder(v.email, shiftDetails);
        return {
          userId: v._id,
          email: v.email,
          result
        };
      });

      const emailResults = await Promise.all(emailPromises);

      // Log results
      const successful = emailResults.filter(r => r.result.success);
      const failed = emailResults.filter(r => !r.result.success);

      console.log(`Reminder email results: ${successful.length} sent, ${failed.length} failed`);

      if (failed.length > 0) {
        console.log('Failed reminder emails:', failed.map(f => ({
          email: f.email,
          error: f.result.error
        })));
      }

      // Avoid duplicate reminders
      await Shift.findByIdAndUpdate(shift._id, { reminderSent: true });

      console.log(`Completed reminders for ${shift.role} shift`);

    } catch (error) {
      console.error(`Error sending reminders for shift ${shift._id}:`, error);
    }
  }

  formatTimeForComparison(date) {
    return date.toTimeString().slice(0, 5);
  }

  // Manual trigger for testing
  async sendTestReminders() {
    console.log('Running test reminder check...');
    await this.checkAndSendReminders();
  }

  // Stop the job
  stop() {
    console.log('Stopping shift reminder job...');
  }
}

module.exports = new ReminderJob();