const { Resend } = require("resend");

// Replaces smsService/Twilio. Every volunteer already has an email on file
// (it's how they log in), so there's no phone lookup step anymore -- the
// callers below just pass user.email straight from the Mongo User doc.
//
// Uses Resend (resend.com) instead of Gmail/Nodemailer -- Gmail's App
// Password setup wasn't available on the sending account, and Resend's free
// tier (3,000 emails/month) needs just an API key, no mailbox MFA dance.
//
// Setup needed in .env:
//   RESEND_API_KEY=re_xxxxxxxx     (from resend.com/api-keys)
//   RESEND_FROM_EMAIL=notifications@yourdomain.com
//                                   (must be on a domain you've verified in
//                                    the Resend dashboard -- resend.com/domains.
//                                    Verifying adds a couple of DNS records at
//                                    your domain registrar; takes a few
//                                    minutes to propagate. Until verified,
//                                    Resend only lets you send to the email
//                                    address on your own Resend account, for
//                                    testing.)
//   COORDINATOR_EMAIL=you@...      (where Contact Coordinator alerts go)
// COORDINATOR_NAME and APP_URL are reused from the existing setup.

const COORDINATOR_NAME = process.env.COORDINATOR_NAME || "the BurlyCon team";
const APP_URL = process.env.APP_URL || "https://www.burlyconvolunteers.com";

class EmailService {
  constructor() {
    this.resend = process.env.RESEND_API_KEY ? new Resend(process.env.RESEND_API_KEY) : null;
  }

  formatTime(timeStr) {
    if (!timeStr || !timeStr.includes(":")) return timeStr;
    const [hour, min] = timeStr.split(":");
    const h = parseInt(hour, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const displayHour = ((h + 11) % 12) + 1;
    return `${displayHour}:${min} ${suffix}`;
  }

  async send(to, subject, text) {
    if (!this.resend) {
      console.warn("RESEND_API_KEY not set -- email not sent:", subject);
      return { success: false, error: "Email isn't configured yet (RESEND_API_KEY missing)" };
    }
    if (!process.env.RESEND_FROM_EMAIL) {
      return { success: false, error: "RESEND_FROM_EMAIL isn't set -- no verified sender to send from" };
    }
    if (!to) {
      return { success: false, error: "No email address on file for this volunteer" };
    }

    try {
      const { data, error } = await this.resend.emails.send({
        from: `${COORDINATOR_NAME} <${process.env.RESEND_FROM_EMAIL}>`,
        to,
        subject,
        text,
      });

      if (error) {
        console.error("Email sending failed:", error);
        return { success: false, error: error.message || String(error), to };
      }

      console.log(`Email sent to ${to}: ${subject} (id ${data?.id})`);
      return { success: true, messageId: data?.id, to };
    } catch (error) {
      console.error("Email sending failed:", error);
      return { success: false, error: error.message, to };
    }
  }

  // ---------- Shift reminder (sent ~1hr before a shift starts) ----------

  createReminderMessage({ role, startTime, location, volunteerName }) {
    const startTimeFormatted = this.formatTime(startTime);
    const locationText = location ? ` at ${location}` : "";
    const greeting = volunteerName ? `Hi ${volunteerName},` : "Hi,";
    return (
      `${greeting}\n\n` +
      `Quick reminder from your BurlyCon volunteer coordinator: your "${role}" shift starts in about ` +
      `1 hour (${startTimeFormatted})${locationText}.\n\n` +
      `Thanks for volunteering!\n\n-- ${COORDINATOR_NAME}`
    );
  }

  async sendShiftReminder(email, shiftDetails) {
    return this.send(
      email,
      `Reminder: your "${shiftDetails.role}" shift starts soon`,
      this.createReminderMessage(shiftDetails)
    );
  }

  // ---------- Removed from a shift ----------

  createRemovalMessage({ role, date, startTime, reason }) {
    const timeFormatted = this.formatTime(startTime);
    const reasonText = reason ? ` (${reason})` : "";
    return (
      `Hi,\n\nThis is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator.\n\n` +
      `Oops, sorry -- there's been a change and we had to remove you from your "${role}" shift ` +
      `on ${date} at ${timeFormatted}${reasonText}.\n\n` +
      `Please log in at ${APP_URL} to see your current shifts.\n\n` +
      `Questions? Use the Contact Coordinator button in the app.\n\n-- ${COORDINATOR_NAME}`
    );
  }

  async sendRemovalNotice(email, details) {
    return this.send(
      email,
      `You've been removed from your "${details.role}" shift`,
      this.createRemovalMessage(details)
    );
  }

  // In-app version of the same notice -- shown inside the login
  // acknowledgment modal, where "please log in" makes no sense since
  // they're already logged in reading it. Keeps the apology/reason, drops
  // the login prompt.
  createInAppRemovalMessage({ role, date, startTime, reason }) {
    const timeFormatted = this.formatTime(startTime);
    const reasonText = reason ? ` (${reason})` : "";
    return (
      `Oops, sorry -- there's been a change and we had to remove you from your "${role}" shift ` +
      `on ${date} at ${timeFormatted}${reasonText}.\n\n` +
      `Questions? Use the Contact Coordinator button.\n\n-- ${COORDINATOR_NAME}`
    );
  }

  // ---------- Moved to a different shift ----------

  createShiftChangeMessage({ oldRole, newRole, newDate, newStartTime }) {
    const timeFormatted = this.formatTime(newStartTime);
    return (
      `Hi,\n\nThis is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator.\n\n` +
      `Oops, sorry -- there's been a change to your "${oldRole}" shift. We've moved you to ` +
      `"${newRole}" on ${newDate} at ${timeFormatted} instead.\n\n` +
      `Please log in at ${APP_URL} to see your current shifts and make sure this still works for you.\n\n` +
      `Questions? Use the Contact Coordinator button in the app.\n\n-- ${COORDINATOR_NAME}`
    );
  }

  async sendShiftChangeNotice(email, details) {
    return this.send(email, "Your BurlyCon shift has changed", this.createShiftChangeMessage(details));
  }

  // In-app version -- see note on createInAppRemovalMessage above.
  createInAppShiftChangeMessage({ oldRole, newRole, newDate, newStartTime }) {
    const timeFormatted = this.formatTime(newStartTime);
    return (
      `Oops, sorry -- there's been a change to your "${oldRole}" shift. We've moved you to ` +
      `"${newRole}" on ${newDate} at ${timeFormatted} instead.\n\n` +
      `Take a look at your shifts and make sure this still works for you. ` +
      `Questions? Use the Contact Coordinator button.\n\n-- ${COORDINATOR_NAME}`
    );
  }

  // ---------- Volunteer -> coordinator, via the Contact Coordinator button ----------

  createCoordinatorAlertMessage({ volunteerName, message, shiftContext }) {
    const context = shiftContext ? ` (re: ${shiftContext})` : "";
    return (
      `New message from ${volunteerName}${context} via the Contact Coordinator button:\n\n` +
      `"${message}"\n\n` +
      `Log in to the admin Messages page to respond or mark it resolved.`
    );
  }

  async sendCoordinatorAlert(coordinatorEmail, details) {
    return this.send(
      coordinatorEmail,
      `New volunteer message from ${details.volunteerName}`,
      this.createCoordinatorAlertMessage(details)
    );
  }

  // ---------- Role request decisions ----------

  createRoleRequestApprovedMessage({ role }) {
    return (
      `Hi,\n\nThis is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator.\n\n` +
      `Good news -- you're approved for "${role}"! Log in at ${APP_URL} to sign up for a shift.\n\n` +
      `-- ${COORDINATOR_NAME}`
    );
  }

  async sendRoleRequestApprovedNotice(email, details) {
    return this.send(
      email,
      `You're approved for "${details.role}"`,
      this.createRoleRequestApprovedMessage(details)
    );
  }

  // In-app version -- see note on createInAppRemovalMessage above.
  createInAppRoleRequestApprovedMessage({ role }) {
    return `Good news -- you're approved for "${role}"! Head to the volunteer shifts page to sign up.\n\n-- ${COORDINATOR_NAME}`;
  }

  createRoleRequestDeniedMessage({ role }) {
    return (
      `Hi,\n\nThis is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator.\n\n` +
      `Thanks for your interest in "${role}" -- we're not able to approve it right now. ` +
      `You're welcome to check back and request again later.\n\n` +
      `Questions? Use the Contact Coordinator button in the app.\n\n-- ${COORDINATOR_NAME}`
    );
  }

  async sendRoleRequestDeniedNotice(email, details) {
    return this.send(
      email,
      `Update on your "${details.role}" request`,
      this.createRoleRequestDeniedMessage(details)
    );
  }

  // In-app version -- see note on createInAppRemovalMessage above.
  createInAppRoleRequestDeniedMessage({ role }) {
    return (
      `Thanks for your interest in "${role}" -- we're not able to approve it right now. ` +
      `You're welcome to check back and request again later.\n\n` +
      `Questions? Use the Contact Coordinator button.\n\n-- ${COORDINATOR_NAME}`
    );
  }
}

module.exports = new EmailService();