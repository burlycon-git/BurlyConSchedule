const twilio = require('twilio');

// Who the "this is ___, your volunteer coordinator" messages claim to be
// from, and where volunteers are told to log in. Set these in your .env --
// COORDINATOR_NAME defaults to "the BurlyCon team" if unset so a missing
// env var doesn't silently sign messages with "undefined".
const COORDINATOR_NAME = process.env.COORDINATOR_NAME || "the BurlyCon team";
const APP_URL = process.env.APP_URL || "https://www.burlyconvolunteers.com";

class SMSService {
  constructor() {
    this.client = twilio(
      process.env.TWILIO_ACCOUNT_SID,
      process.env.TWILIO_AUTH_TOKEN
    );
    this.fromNumber = process.env.TWILIO_PHONE_NUMBER;
  }

  async sendShiftReminder(phoneNumber, shiftDetails) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const message = this.createReminderMessage(shiftDetails);

      console.log(`Sending SMS to ${formattedPhone}: ${message}`);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      console.log(`SMS sent successfully. SID: ${result.sid}`);
      return {
        success: true,
        messageSid: result.sid,
        to: formattedPhone
      };

    } catch (error) {
      console.error('SMS sending failed:', error);
      return {
        success: false,
        error: error.message,
        to: phoneNumber
      };
    }
  }

  // Sent when an admin moves a volunteer from one shift to another
  // (e.g. a shift was created in error and needs to be collapsed into
  // an equivalent one).
  async sendShiftChangeNotice(phoneNumber, changeDetails) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const message = this.createShiftChangeMessage(changeDetails);

      console.log(`Sending shift-change SMS to ${formattedPhone}: ${message}`);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      return {
        success: true,
        messageSid: result.sid,
        to: formattedPhone
      };

    } catch (error) {
      console.error('Shift-change SMS failed:', error);
      return {
        success: false,
        error: error.message,
        to: phoneNumber
      };
    }
  }

  // Sent when an admin removes a volunteer from a shift outright
  // (bad shift being deleted with no replacement, or an unapproved
  // signup being pulled from a restricted role).
  async sendRemovalNotice(phoneNumber, removalDetails) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const message = this.createRemovalMessage(removalDetails);

      console.log(`Sending removal SMS to ${formattedPhone}: ${message}`);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      return {
        success: true,
        messageSid: result.sid,
        to: formattedPhone
      };

    } catch (error) {
      console.error('Removal SMS failed:', error);
      return {
        success: false,
        error: error.message,
        to: phoneNumber
      };
    }
  }

  // Alerts the coordinator (you) that a volunteer submitted a message
  // through the in-app Contact Coordinator button. See
  // createCoordinatorAlertMessage for why this is safe on a free Twilio
  // trial even before the rest of this is upgraded.
  async sendCoordinatorAlert(phoneNumber, alertDetails) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const message = this.createCoordinatorAlertMessage(alertDetails);

      console.log(`Sending coordinator alert SMS to ${formattedPhone}: ${message}`);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      return {
        success: true,
        messageSid: result.sid,
        to: formattedPhone
      };

    } catch (error) {
      console.error('Coordinator alert SMS failed:', error);
      return {
        success: false,
        error: error.message,
        to: phoneNumber
      };
    }
  }

  // Sent when a volunteer's request to access a restricted role is
  // approved -- they can now self-serve signup for that role normally.
  async sendRoleRequestApprovedNotice(phoneNumber, details) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const message = this.createRoleRequestApprovedMessage(details);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      return { success: true, messageSid: result.sid, to: formattedPhone };
    } catch (error) {
      console.error('Role request approved SMS failed:', error);
      return { success: false, error: error.message, to: phoneNumber };
    }
  }

  // Sent when a request is denied. Deliberately doesn't say "never" --
  // denial isn't final, they can request again (see roleRequestController).
  async sendRoleRequestDeniedNotice(phoneNumber, details) {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);
      const message = this.createRoleRequestDeniedMessage(details);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      return { success: true, messageSid: result.sid, to: formattedPhone };
    } catch (error) {
      console.error('Role request denied SMS failed:', error);
      return { success: false, error: error.message, to: phoneNumber };
    }
  }

  formatPhoneNumber(phone) {
    const digits = phone.replace(/\D/g, '');

    if (digits.length === 10) {
      return `+1${digits}`;
    }

    if (digits.length >= 11 && !phone.startsWith('+')) {
      return `+${digits}`;
    }

    return phone;
  }

  formatTime(timeStr) {
    const [hour, min] = timeStr.split(':');
    const h = parseInt(hour);
    const suffix = h >= 12 ? 'PM' : 'AM';
    const displayHour = ((h + 11) % 12) + 1;
    return `${displayHour}:${min} ${suffix}`;
  }

  createReminderMessage(shiftDetails) {
    const { role, startTime, location } = shiftDetails;
    const startTimeFormatted = this.formatTime(startTime);
    const locationText = location ? ` at ${location}` : '';

    return `🎭 BurlyCon Reminder: Your ${role} shift starts in 1 hour (${startTimeFormatted})${locationText}. Thanks for volunteering! Reply STOP to opt out.`;
  }

  createShiftChangeMessage(changeDetails) {
    const { oldRole, newRole, newDate, newStartTime } = changeDetails;
    const newTimeFormatted = this.formatTime(newStartTime);

    return `Hi, this is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator. Oops, sorry -- we had to move your "${oldRole}" shift. You're now on "${newRole}" on ${newDate} at ${newTimeFormatted} instead. Please log in at ${APP_URL} to confirm that works. If not, use the Contact Coordinator button in the app.`;
  }

  createRemovalMessage(removalDetails) {
    const { role, date, startTime, reason } = removalDetails;
    const timeFormatted = this.formatTime(startTime);
    const reasonText = reason ? ` (${reason})` : '';

    return `Hi, this is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator. Oops, sorry -- there's been a change and we had to remove you from your "${role}" shift on ${date} at ${timeFormatted}${reasonText}. Please log in at ${APP_URL} to see your current shifts. Questions? Use the Contact Coordinator button in the app.`;
  }

  // Forwarded to the coordinator's own number when a volunteer submits a
  // message through the in-app "Contact Coordinator" button. This is the
  // one SMS in this whole system that's fine to rely on even on Twilio's
  // free trial, since it only ever goes to one number -- yours -- which you
  // can keep verified. Everything sent TO volunteers above still needs a
  // paid Twilio account to reach anyone outside your 5 verified test numbers.
  createCoordinatorAlertMessage(alertDetails) {
    const { volunteerName, message, shiftContext } = alertDetails;
    const MAX_EXCERPT = 300;
    const trimmed = String(message || "").trim();
    const excerpt = trimmed.length > MAX_EXCERPT
      ? `${trimmed.slice(0, MAX_EXCERPT)}…`
      : trimmed;
    const contextText = shiftContext ? ` (re: ${shiftContext})` : '';

    return `BurlyCon volunteer message from ${volunteerName || "a volunteer"}${contextText}: "${excerpt}"${trimmed.length > MAX_EXCERPT ? " (see admin log for full message)" : ""}`;
  }

  createRoleRequestApprovedMessage(details) {
    const { role } = details;
    return `Hi, this is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator. Good news -- you're approved for "${role}"! Log in at ${APP_URL} to sign up for a shift.`;
  }

  createRoleRequestDeniedMessage(details) {
    const { role } = details;
    return `Hi, this is ${COORDINATOR_NAME}, your BurlyCon volunteer coordinator. Your request for "${role}" wasn't approved this time. Use the Contact Coordinator button in the app if you have questions, or feel free to request again later.`;
  }

  async sendTestMessage(phoneNumber, message = "Test message from BurlyCon Volunteer System!") {
    try {
      const formattedPhone = this.formatPhoneNumber(phoneNumber);

      const result = await this.client.messages.create({
        body: message,
        from: this.fromNumber,
        to: formattedPhone
      });

      return {
        success: true,
        messageSid: result.sid,
        to: formattedPhone
      };

    } catch (error) {
      console.error('Test SMS failed:', error);
      return {
        success: false,
        error: error.message,
        to: phoneNumber
      };
    }
  }
}

module.exports = new SMSService();