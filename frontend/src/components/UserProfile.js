import React, { useState, useEffect } from "react";
import "../styles/profile.css";
import Header from "./Header";

export default function UserProfile() {
  const [volunteerShifts, setVolunteerShifts] = useState([]);
  const [totalHours, setTotalHours] = useState(0);
  const [loading, setLoading] = useState(true);
  const [roles, setRoles] = useState([]);

  const API = (p) => `${process.env.REACT_APP_API_BASE || ""}${p}`;

  let userId = null;
  try {
    const token = localStorage.getItem("access_token");
    if (token) {
      const payload = JSON.parse(atob(token.split(".")[1]));
      userId = payload.sub;
    }
  } catch (error) {
    console.error("Error parsing JWT:", error);
  }

  useEffect(() => {
    fetch(API("/api/shiftroles"))
      .then(res => res.json())
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error loading roles:", err));
  }, []);

  useEffect(() => {
    if (!userId) {
      setLoading(false);
      return;
    }
    (async () => {
      try {
        setLoading(true);
        const res = await fetch(API(`/api/volunteer/user/${userId}`));
        const data = await res.json();
        setVolunteerShifts(data.shifts || []);
        setTotalHours(data.totalHours || 0);
      } catch (err) {
        console.error("Error fetching volunteer info:", err);
      } finally {
        setLoading(false);
      }
    })();
  }, [userId]);

  const getRoleDetails = (roleName) => {
    return roles.find(r => r.name === roleName) || {};
  };

  // Round hours to 1 decimal, drop trailing zero
  const roundHours = (h) => {
    const n = Math.round((h || 0) * 10) / 10;
    return Number.isInteger(n) ? n : n.toFixed(1);
  };

  const handleCancelShift = async (shiftId) => {
    const confirmed = window.confirm(
      "Are you sure you want to cancel this shift?"
    );
    if (!confirmed) return;

    try {
      const response = await fetch(API(`/api/volunteer/${shiftId}/cancel`), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId }),
      });

      if (response.ok) {
        const res2 = await fetch(API(`/api/volunteer/user/${userId}`));
        const data2 = await res2.json();
        setVolunteerShifts(data2.shifts || []);
        setTotalHours(data2.totalHours || 0);
      } else {
        const err = await response.json();
        console.error("Cancel failed:", err.message);
      }
    } catch (error) {
      console.error("Error:", error);
    }
  };

  function formatTime(timeStr) {
    if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":"))
      return "Invalid time";
    const [hour, minute] = timeStr.split(":").map(Number);
    const h = hour % 24;
    const ampm = h >= 12 ? "PM" : "AM";
    const adjustedHour = h % 12 || 12;
    return `${adjustedHour}:${String(minute).padStart(2, "0")} ${ampm}`;
  }

  function formatLocalDateYMD(ymd) {
    if (!ymd) return "";
    const [y, m, d] = ymd.split("-").map(Number);
    return new Date(y, m - 1, d).toLocaleDateString(undefined, {
      weekday: "long",
      month: "short",
      day: "numeric",
    });
  }

  // Group shifts by date instead of role|date
  const groupedByDate = volunteerShifts.reduce((acc, shift) => {
    if (!acc[shift.date]) acc[shift.date] = [];
    acc[shift.date].push(shift);
    return acc;
  }, {});

  const sortedDates = Object.keys(groupedByDate).sort();

  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userName = user?.preferredName || user?.given_name || user?.email?.split("@")[0] || "Volunteer";

  const displayHours = roundHours(totalHours);
  const hoursToHalf = Math.max(0, 8 - totalHours);
  const hoursToFull = Math.max(0, 16 - totalHours);

  return (
    <div className="modern-page-container">
      <Header />

      <div className="modern-profile-hero">
        <div className="modern-profile-hero-content">
          <div className="modern-profile-avatar">
            {userName.charAt(0).toUpperCase()}
          </div>
          <div className="modern-profile-info">
            <h1 className="modern-profile-title">
              Welcome back, {userName}!
            </h1>
            <p className="modern-profile-subtitle">
              Your volunteer dashboard
            </p>
          </div>
        </div>
      </div>

      <div className="modern-content-wrapper">
        <div className="modern-stats-section">
          <div className="modern-stats-grid">
            <div className="modern-stat-card hours">
              <div className="modern-stat-icon">⏰</div>
              <div className="modern-stat-content">
                <div className="modern-stat-number">{displayHours}</div>
                <div className="modern-stat-label">Hours Volunteered</div>
              </div>
            </div>
            <div className="modern-stat-card shifts">
              <div className="modern-stat-icon">📅</div>
              <div className="modern-stat-content">
                <div className="modern-stat-number">
                  {volunteerShifts.length}
                </div>
                <div className="modern-stat-label">Active Shifts</div>
              </div>
            </div>
            <div className="modern-stat-card status">
              <div className="modern-stat-icon">🎟️</div>
              <div className="modern-stat-content">
                {totalHours >= 16 ? (
                  <>
                    <div className="modern-stat-code">v0lunteer26</div>
                    <div className="modern-stat-label">100% Off Ticket Code!</div>
                    <div className="modern-stat-note success">
                      ✨ You've earned a free ticket!
                    </div>
                  </>
                ) : totalHours >= 8 ? (
                  <>
                    <div className="modern-stat-code">v0lunteer2650</div>
                    <div className="modern-stat-label">50% Off Ticket Code!</div>
                    <div className="modern-stat-note warning">
                      {roundHours(hoursToFull)} more hours for 100% off!
                    </div>
                  </>
                ) : (
                  <>
                    <div className="modern-stat-number">{displayHours}/8</div>
                    <div className="modern-stat-label">Hours to 50% Off</div>
                    <div className="modern-stat-note muted">
                      Sign up for {roundHours(hoursToHalf)} more hours to unlock your discount code!
                    </div>
                  </>
                )}
              </div>
            </div>
          </div>
        </div>

        <div className="modern-shifts-section">
          <div className="modern-section-header">
            <h2 className="modern-section-title">My Volunteer Shifts</h2>
            {volunteerShifts.length > 0 && (
              <p className="modern-section-description">
                Manage your upcoming volunteer commitments
              </p>
            )}
          </div>

          {loading ? (
            <div className="modern-loading-state">
              <div className="modern-loading-spinner"></div>
              <p>Loading your shifts...</p>
            </div>
          ) : volunteerShifts.length === 0 ? (
            <div className="modern-empty-state">
              <div className="modern-empty-icon">📅</div>
              <h3 className="modern-empty-title">No shifts scheduled</h3>
              <p className="modern-empty-description">
                Ready to help make BurlyCon amazing? Browse available volunteer
                opportunities!
              </p>
              <a href="/volunteer" className="modern-empty-action">
                <span className="modern-button-icon">🔍</span>
                Browse Volunteer Shifts
              </a>
            </div>
          ) : (
            <div className="modern-day-list">
              {sortedDates.map((date) => {
                // Sort by start time within the day
                const dayShifts = groupedByDate[date].sort((a, b) =>
                  a.startTime.localeCompare(b.startTime)
                );

                // Annotate consecutive same-role shifts
                const annotated = dayShifts.map((shift, i) => {
                  const prev = dayShifts[i - 1];
                  const continuesFromPrev =
                    prev &&
                    prev.role === shift.role &&
                    prev.endTime === shift.startTime;
                  const next = dayShifts[i + 1];
                  const continuesToNext =
                    next &&
                    next.role === shift.role &&
                    shift.endTime === next.startTime;
                  return { ...shift, continuesFromPrev, continuesToNext };
                });

                return (
                  <div key={date} className="modern-day-group">
                    <div className="modern-day-header">
                      {formatLocalDateYMD(date)}
                    </div>
                    <div className="modern-day-shifts">
                      {annotated.map((shift) => {
                        const roleDetails = getRoleDetails(shift.role);
                        const hasContact =
                          roleDetails.location ||
                          roleDetails.pointOfContact ||
                          roleDetails.contactPhone;

                        return (
                          <div
                            key={shift._id}
                            className={`modern-day-shift ${shift.continuesFromPrev ? "continues-from" : ""} ${shift.continuesToNext ? "continues-to" : ""}`}
                          >
                            <div className="modern-day-shift-main">
                              <div className="modern-day-shift-role">
                                {shift.role}
                                {shift.continuesFromPrev && (
                                  <span className="modern-day-shift-continues"> (continues)</span>
                                )}
                              </div>
                              <div className="modern-day-shift-time">
                                🕒 {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                              </div>
                            </div>

                            {hasContact && !shift.continuesFromPrev && (
                              <div className="modern-day-shift-details">
                                {roleDetails.location && (
                                  <div className="modern-detail-item">
                                    <span className="modern-detail-icon">📍</span>
                                    <span className="modern-detail-text">{roleDetails.location}</span>
                                  </div>
                                )}
                                {roleDetails.pointOfContact && (
                                  <div className="modern-detail-item">
                                    <span className="modern-detail-icon">👤</span>
                                    <span className="modern-detail-label">Lead:</span>
                                    <span className="modern-detail-text">{roleDetails.pointOfContact}</span>
                                  </div>
                                )}
                                {roleDetails.contactPhone && (
                                  <div className="modern-detail-item">
                                    <span className="modern-detail-icon">📞</span>
                                    <a href={`tel:${roleDetails.contactPhone}`} className="modern-detail-link">
                                      {roleDetails.contactPhone}
                                    </a>
                                  </div>
                                )}
                              </div>
                            )}

                            <button
                              type="button"
                              className="modern-cancel-button"
                              onClick={() => handleCancelShift(shift._id)}
                              title="Cancel this shift"
                            >
                              ❌
                            </button>
                          </div>
                        );
                      })}
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