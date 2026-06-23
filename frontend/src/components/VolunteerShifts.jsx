import React, { useEffect, useState } from "react";
import "../styles/volunteer.css";
import Header from "./Header";
import { getUserId } from "../utils/authUtils";

const PLACEHOLDER = "/schedule-coming-soon.svg";

const scheduleImages = {
  "2026-11-04": "https://i.ibb.co/JjXqf5kM/Wedneday-Image.png",
  "2026-11-05": PLACEHOLDER,
  "2026-11-06": PLACEHOLDER,
  "2026-11-07": PLACEHOLDER,
  "2026-11-08": PLACEHOLDER,
};

// Bucket a shift's start time into a daypart
function getDaypart(startTime) {
  if (!startTime || !startTime.includes(":")) return "Other";
  const [h] = startTime.split(":").map(Number);
  if (h < 12) return "Morning";
  if (h < 17) return "Afternoon";
  return "Evening";
}

const DAYPART_ORDER = ["Morning", "Afternoon", "Evening", "Other"];

export default function VolunteerShifts() {
  const [selectedDate, setSelectedDate] = useState(null);
  const [shifts, setShifts] = useState([]);
  const [roleDetails, setRoleDetails] = useState({});
  const [userId, setUserId] = useState(null);
  const [loading, setLoading] = useState(true);
  const [expandedRole, setExpandedRole] = useState(null);
  const [defaultDateChosen, setDefaultDateChosen] = useState(false);

  const dateOptions = [
    { label: "Wed 11/4", value: "2026-11-04", day: "Wednesday" },
    { label: "Thu 11/5", value: "2026-11-05", day: "Thursday" },
    { label: "Fri 11/6", value: "2026-11-06", day: "Friday" },
    { label: "Sat 11/7", value: "2026-11-07", day: "Saturday" },
    { label: "Sun 11/8", value: "2026-11-08", day: "Sunday" },
  ];

  useEffect(() => {
    const id = getUserId();
    if (id) setUserId(id);
  }, []);

  useEffect(() => {
    Object.values(scheduleImages).forEach((url) => {
      const img = new Image();
      img.src = url;
    });
  }, []);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_BASE}/api/shiftroles`)
      .then((res) => res.json())
      .then((data) => {
        const roleMap = {};
        data.forEach((role) => {
          roleMap[role.name] = role;
        });
        setRoleDetails(roleMap);
      })
      .catch((err) => console.error("Error fetching role details:", err));
  }, []);

  useEffect(() => {
    if (defaultDateChosen) return;
    fetch(`${process.env.REACT_APP_API_BASE}/api/volunteer`)
      .then((res) => res.json())
      .then((data) => {
        const datesReversed = [...dateOptions].reverse().map((d) => d.value);
        let chosen = datesReversed[0];
        for (const d of datesReversed) {
          const dayShifts = data.filter((s) => s.date === d);
          const hasOpening = dayShifts.some(
            (s) => s.volunteersNeeded - s.volunteersRegistered.length > 0
          );
          if (hasOpening) {
            chosen = d;
            break;
          }
        }
        setSelectedDate(chosen);
        setDefaultDateChosen(true);
      })
      .catch((err) => {
        console.error("Error picking default date:", err);
        setSelectedDate("2026-11-08");
        setDefaultDateChosen(true);
      });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  useEffect(() => {
    if (!selectedDate) return;
    setLoading(true);
    fetch(`${process.env.REACT_APP_API_BASE}/api/volunteer`)
      .then((res) => res.json())
      .then((data) => {
        const filtered = data.filter((shift) => shift.date === selectedDate);
        setShifts(filtered);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching shifts:", err);
        setLoading(false);
      });
  }, [selectedDate]);

  const to12Hour = (timeStr) => {
    const [hour, min] = timeStr.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = ((hour + 11) % 12) + 1;
    return `${displayHour}:${min.toString().padStart(2, "0")} ${suffix}`;
  };

  const handleSignup = async (shiftId) => {
    if (!userId) return;
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/volunteer/${shiftId}/signup`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );
      if (res.ok) {
        setShifts((prev) =>
          prev.map((shift) =>
            shift._id === shiftId
              ? {
                  ...shift,
                  volunteersRegistered: [...shift.volunteersRegistered, userId],
                }
              : shift,
          ),
        );
      }
    } catch (err) {
      console.error("Signup error:", err);
    }
  };

  const handleCancel = async (shiftId) => {
    if (!userId) return;
    try {
      const res = await fetch(
        `${process.env.REACT_APP_API_BASE}/api/volunteer/${shiftId}/cancel`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ userId }),
        },
      );
      if (res.ok) {
        setShifts((prev) =>
          prev.map((shift) =>
            shift._id === shiftId
              ? {
                  ...shift,
                  volunteersRegistered: shift.volunteersRegistered.filter(
                    (id) => id !== userId,
                  ),
                }
              : shift,
          ),
        );
      }
    } catch (err) {
      console.error("Cancel error:", err);
    }
  };

  const toggleRoleExpansion = (role) => {
    setExpandedRole(expandedRole === role ? null : role);
  };

  // Group shifts by role
  const grouped = shifts.reduce((acc, shift) => {
    if (!acc[shift.role]) acc[shift.role] = [];
    acc[shift.role].push(shift);
    return acc;
  }, {});

  // Compute aggregate stats per role for sorting + filtering
  const roleStats = Object.entries(grouped).map(([role, roleShifts]) => {
    const totalSignups = roleShifts.reduce(
      (sum, s) => sum + s.volunteersRegistered.length,
      0
    );
    const totalOpen = roleShifts.reduce(
      (sum, s) => sum + Math.max(0, s.volunteersNeeded - s.volunteersRegistered.length),
      0
    );
    return { role, roleShifts, totalSignups, totalOpen };
  });

  // Hide roles where every shift is full (no open spots anywhere)
  const visibleRoles = roleStats.filter((r) => r.totalOpen > 0);

  // Sort:
  //   1. Roles with 0 signups first
  //   2. Then by total open spots descending (more open = higher up)
  //   3. Then alphabetically for stable ordering
  visibleRoles.sort((a, b) => {
    const aZero = a.totalSignups === 0 ? 0 : 1;
    const bZero = b.totalSignups === 0 ? 0 : 1;
    if (aZero !== bZero) return aZero - bZero;
    if (b.totalOpen !== a.totalOpen) return b.totalOpen - a.totalOpen;
    return a.role.localeCompare(b.role);
  });

  const selectedDateOption = dateOptions.find(
    (option) => option.value === selectedDate,
  );
  const totalSignedUp = shifts.filter((shift) =>
    shift.volunteersRegistered.includes(userId),
  ).length;

  return (
    <div className="modern-page-container">
      <Header />

      <div className="modern-volunteer-hero">
        <div className="modern-volunteer-hero-content">
          <h1 className="modern-volunteer-title">
            ✨ Choose Your Volunteer Shifts ✨
          </h1>
          <p className="modern-volunteer-subtitle">
            Help make BurlyCon magical! Select your preferred shifts and join
            the Sparkle Squad.
          </p>
          {totalSignedUp > 0 && (
            <div className="modern-signup-summary">
              🎭 You're signed up for {totalSignedUp} shift
              {totalSignedUp !== 1 ? "s" : ""} on {selectedDateOption?.day}
            </div>
          )}
        </div>
      </div>

      <div className="modern-content-wrapper">
        <div className="modern-date-section">
          <h2 className="modern-section-title">Select Event Day</h2>
          <div className="modern-date-switcher">
            {dateOptions.map(({ label, value, day }) => (
              <button
                type="button"
                key={value}
                className={`modern-date-button ${
                  value === selectedDate ? "active" : ""
                }`}
                onClick={() => setSelectedDate(value)}
              >
                <span className="modern-date-label">{label}</span>
                <span className="modern-date-day">{day}</span>
              </button>
            ))}
          </div>
        </div>

        <div className="modern-schedule-section">
          <h3 className="modern-schedule-title">
            📋 {selectedDateOption?.day} Schedule
          </h3>
  <div className="modern-schedule-image">
    <a
      href={scheduleImages[selectedDate]}
      target="_blank"
      rel="noopener noreferrer"
      className="modern-schedule-link"
    >
      <img
        key={selectedDate}
        src={scheduleImages[selectedDate]}
        alt={`Schedule for ${selectedDateOption?.day}`}
        className="modern-schedule-img"
      />
      <div className="modern-schedule-overlay">
        <span className="modern-schedule-text">
          🔍 Click to view full schedule
        </span>
      </div>
    </a>
  </div>
</div>

        <div className="modern-shifts-section">
          <div className="modern-section-header">
            <h2 className="modern-section-title">Available Volunteer Roles</h2>
            <p className="modern-section-description">
              {selectedDateOption?.day} • {visibleRoles.length} role
              {visibleRoles.length !== 1 ? "s" : ""} need help
            </p>
          </div>

          {loading ? (
            <div className="modern-loading-state">
              <div className="modern-loading-spinner"></div>
              <p>Loading volunteer opportunities...</p>
            </div>
          ) : visibleRoles.length === 0 ? (
            <div className="modern-empty-state">
              <div className="modern-empty-icon">🎉</div>
              <h3 className="modern-empty-title">All roles fully staffed!</h3>
              <p className="modern-empty-description">
                Every volunteer position for {selectedDateOption?.day} is
                filled. Check another day or come back later in case spots open up.
              </p>
            </div>
          ) : (
            <div className="modern-roles-grid">
              {visibleRoles.map(({ role, roleShifts, totalSignups, totalOpen }) => {
                const roleInfo = roleDetails[role] || {};
                const isExpanded = expandedRole === role;

                const sortedShifts = [...roleShifts].sort((a, b) =>
                  a.startTime.localeCompare(b.startTime)
                );

                const byDaypart = sortedShifts.reduce((acc, shift) => {
                  const part = getDaypart(shift.startTime);
                  if (!acc[part]) acc[part] = [];
                  acc[part].push(shift);
                  return acc;
                }, {});

                const dayparts = DAYPART_ORDER.filter((p) => byDaypart[p]);
                const isUntouched = totalSignups === 0;

                return (
                  <div
                    key={role}
                    className={`modern-role-card ${isExpanded ? "expanded" : ""} ${isUntouched ? "untouched" : ""}`}
                  >
                    <div
                      className="modern-role-header clickable"
                      onClick={() => toggleRoleExpansion(role)}
                    >
                      <div className="modern-role-info">
                        <h3 className="modern-role-title">{role}</h3>
                        <p className="modern-role-count">
                          {totalOpen} spot{totalOpen !== 1 ? "s" : ""} open
                          {isUntouched && " • no signups yet"}
                        </p>
                      </div>
                      <div className="modern-role-actions">
                        <div className="modern-role-icon">🌟</div>
                        <div
                          className={`modern-expand-icon ${isExpanded ? "expanded" : ""}`}
                        >
                          ▼
                        </div>
                      </div>
                    </div>

                    {isExpanded && (
                      <div className="modern-role-details">
                        <div className="modern-role-details-content">
                          {roleShifts[0]?.taskDescription && (
                            <div className="modern-detail-section">
                              <h4 className="modern-detail-title">
                                <span className="modern-detail-icon">📝</span>
                                What You'll Do
                              </h4>
                              <p className="modern-detail-text">
                                {roleShifts[0].taskDescription}
                              </p>
                            </div>
                          )}

                          {roleInfo.responsibilities && (
                            <div className="modern-detail-section">
                              <h4 className="modern-detail-title">
                                <span className="modern-detail-icon">🎯</span>
                                Responsibilities
                              </h4>
                              <p className="modern-detail-text">
                                {roleInfo.responsibilities}
                              </p>
                            </div>
                          )}

                          {roleInfo.location && (
                            <div className="modern-detail-section">
                              <h4 className="modern-detail-title">
                                <span className="modern-detail-icon">📍</span>
                                Location
                              </h4>
                              <p className="modern-detail-text">
                                {roleInfo.location}
                              </p>
                            </div>
                          )}

                          {roleInfo.physicalRequirements && (
                            <div className="modern-detail-section">
                              <h4 className="modern-detail-title">
                                <span className="modern-detail-icon">💪</span>
                                Physical Requirements
                              </h4>
                              <p className="modern-detail-text">
                                {roleInfo.physicalRequirements}
                              </p>
                            </div>
                          )}

                          {roleShifts.some((shift) => shift.notes) && (
                            <div className="modern-detail-section">
                              <h4 className="modern-detail-title">
                                <span className="modern-detail-icon">📌</span>
                                Additional Notes
                              </h4>
                              {roleShifts
                                .filter((shift) => shift.notes)
                                .map((shift) => (
                                  <p
                                    key={shift._id}
                                    className="modern-detail-text modern-note"
                                  >
                                    {shift.notes}
                                  </p>
                                ))}
                            </div>
                          )}
                        </div>
                      </div>
                    )}

                    <div className="modern-shifts-list">
                      {dayparts.map((daypart) => (
                        <div key={daypart} className="modern-daypart-group">
                          <div className="modern-daypart-label">{daypart}</div>
                          {byDaypart[daypart].map((shift) => {
                            const isSignedUp =
                              shift.volunteersRegistered.includes(userId);
                            const available =
                              shift.volunteersNeeded -
                              shift.volunteersRegistered.length;
                            const isFull = available <= 0;

                            if (isFull && !isSignedUp) return null;

                            return (
                              <div key={shift._id} className="modern-shift-item">
                                <div className="modern-shift-time">
                                  <span className="modern-time-icon">🕒</span>
                                  <span className="modern-time-range">
                                    {to12Hour(shift.startTime)}–
                                    {to12Hour(shift.endTime)}
                                  </span>
                                </div>

                                <div className="modern-shift-action">
                                  {!userId ? (
                                    <div className="modern-login-prompt">
                                      <span className="modern-lock-icon">🔒</span>
                                      <span className="modern-login-text">
                                        Log in to sign up
                                      </span>
                                    </div>
                                  ) : isSignedUp ? (
                                    <button
                                      type="button"
                                      onClick={() => handleCancel(shift._id)}
                                      className="modern-cancel-button"
                                    >
                                      <span className="modern-button-icon">❌</span>
                                      <span className="modern-button-text">Cancel</span>
                                    </button>
                                  ) : (
                                    <button
                                      type="button"
                                      onClick={() => handleSignup(shift._id)}
                                      className="modern-signup-button"
                                    >
                                      <span className="modern-button-icon">✨</span>
                                      <span className="modern-button-text">Sign Up</span>
                                    </button>
                                  )}
                                </div>
                              </div>
                            );
                          })}
                        </div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}