import React, { useEffect, useState, useCallback } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import "../styles/adminVolunteers.css";
import { hasRole } from "../utils/authUtils";

export default function AdminVolunteers() {
  const navigate = useNavigate();
  const [volunteers, setVolunteers] = useState([]);
  const [searchTerm, setSearchTerm] = useState("");
  const [loading, setLoading] = useState(true);
  const [sortBy, setSortBy] = useState("hours");
  const [scope, setScope] = useState("currentEvent");
  const [phoneNumbers, setPhoneNumbers] = useState({});

  // Check user role
  const isAdmin = hasRole("Admin");
  const isLead = hasRole("Lead");
  const canAccessPage = isAdmin || isLead;

  // Redirect 
  useEffect(() => {
    if (!canAccessPage) {
      navigate("/");
    }
  }, [canAccessPage, navigate]);

  // ---- helpers for API calls ----
  const API = (p) => `${process.env.REACT_APP_API_BASE || ""}${p}`;
  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

  const refresh = useCallback(() => {
    setLoading(true);
    const query = scope === "allTime" ? "?scope=allTime" : "";
    fetch(API(`/api/admin/volunteers${query}`), { headers: authHeader() })
      .then((res) => res.json())
      .then((data) => {
        setVolunteers(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching volunteers:", err);
        setLoading(false);
      });
  }, [scope]);

  // Fetch phone numbers 
  useEffect(() => {
    if (volunteers.length === 0) return;

    volunteers.forEach(async (vol) => {
      try {
        const res = await fetch(API(`/api/admin/users/${vol._id || vol.id}/phone`), {
          headers: authHeader()
        });
        if (res.ok) {
          const data = await res.json();
          if (data.mobilePhone) {
            setPhoneNumbers(prev => ({
              ...prev,
              [vol._id || vol.id]: data.mobilePhone
            }));
          }
        }
      } catch (err) {
        console.error(`Error fetching phone for ${vol._id || vol.id}:`, err);
      }
    });
  }, [volunteers]);

  useEffect(() => {
    if (!canAccessPage) {
      setLoading(false);
      return;
    }
    refresh();
  }, [canAccessPage, refresh]);


  async function toggleNoShow(userId, checked) {
    const r = await fetch(API(`/api/users/${userId}/noShow`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ noShow: checked }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Failed to update no-show");
      return;
    }
    refresh();
  }

  async function toggleRestrict(userId, checked) {
    if (checked && !window.confirm("Restrict this volunteer from signups?")) return;
    const r = await fetch(API(`/api/users/${userId}/restrict`), {
      method: "PATCH",
      headers: { "Content-Type": "application/json", ...authHeader() },
      body: JSON.stringify({ isRestricted: checked }),
    });
    if (!r.ok) {
      const d = await r.json().catch(() => ({}));
      alert(d.error || "Failed to update restriction");
      return;
    }
    refresh();
  }

  const filteredVolunteers = volunteers.filter((vol) => {
    const name = (vol.preferredName || vol.name || "").toLowerCase();
    const email = (vol.email || "").toLowerCase();
    const q = searchTerm.toLowerCase();
    return name.includes(q) || email.includes(q);
  });

  const sortedVolunteers = [...filteredVolunteers].sort((a, b) => {
    switch (sortBy) {
      case "name": {
        const an = (a.preferredName || a.name || "").toLowerCase();
        const bn = (b.preferredName || b.name || "").toLowerCase();
        return an.localeCompare(bn);
      }
      case "hours":
        return (b.totalHours || 0) - (a.totalHours || 0);
      case "shifts":
        return (b.shifts?.length || 0) - (a.shifts?.length || 0);
      default:
        return 0;
    }
  });

  const formatTime = (timeStr) => {
    if (!timeStr || typeof timeStr !== "string" || !timeStr.includes(":")) return timeStr;
    const [hour, min] = timeStr.split(":");
    const h = parseInt(hour, 10);
    const suffix = h >= 12 ? "PM" : "AM";
    const displayHour = ((h + 11) % 12) + 1;
    return `${displayHour}:${min} ${suffix}`;
  };

  const totalVolunteers = volunteers.length;
  const totalHours = volunteers.reduce((sum, vol) => sum + (vol.totalHours || 0), 0);
  const activeVolunteers = volunteers.filter((vol) => (vol.shifts?.length || 0) > 0).length;

  return (
    <div className="modern-page-container">
      <Header />

      {/* Header Section */}
      <div className="modern-header-section">
        <div className="modern-header-content">
          <h1 className="modern-page-title">👥 Volunteer Roster</h1>
          <p className="modern-page-subtitle">
            {scope === "currentEvent"
              ? "Volunteers signed up for the current event"
              : "All volunteers, all time"}
          </p>
        </div>
      </div>

      <div className="modern-content-wrapper">
        {/* Summary Stats - Admin Only */}
        {isAdmin && (
          <div className="modern-summary-dashboard">
            <div className="modern-summary-card gradient-blue">
              <div className="modern-summary-icon">👥</div>
              <div className="modern-summary-content">
                <div className="modern-summary-number">{totalVolunteers}</div>
                <div className="modern-summary-title">Total Volunteers</div>
              </div>
            </div>

            <div className="modern-summary-card gradient-green">
              <div className="modern-summary-icon">✨</div>
              <div className="modern-summary-content">
                <div className="modern-summary-number">{activeVolunteers}</div>
                <div className="modern-summary-title">Active Volunteers</div>
              </div>
            </div>

            <div className="modern-summary-card gradient-purple">
              <div className="modern-summary-icon">⏰</div>
              <div className="modern-summary-content">
                <div className="modern-summary-number">{totalHours}</div>
                <div className="modern-summary-title">Total Hours</div>
              </div>
            </div>
          </div>
        )}

        {/* Search and Filter */}
        <div className="modern-filter-section">
          <div className="modern-filter-header">
            <h3 className="modern-filter-title">
              📋 {filteredVolunteers.length} Volunteer{filteredVolunteers.length !== 1 ? "s" : ""} Found
            </h3>
            <div className="modern-filter-controls">
              <div className="modern-search-container">
                <input
                  type="text"
                  placeholder="🔍 Search by name or email..."
                  value={searchTerm}
                  onChange={(e) => setSearchTerm(e.target.value)}
                  className="modern-search-input"
                />
                {searchTerm && (
                  <button
                    onClick={() => setSearchTerm("")}
                    className="modern-clear-search"
                    title="Clear search"
                  >
                    ✕
                  </button>
                )}
              </div>

              <select
                value={scope}
                onChange={(e) => setScope(e.target.value)}
                className="modern-sort-select"
              >
                <option value="currentEvent">Current event only</option>
                <option value="allTime">All-time volunteers</option>
              </select>

              <select
                value={sortBy}
                onChange={(e) => setSortBy(e.target.value)}
                className="modern-sort-select"
              >
                <option value="hours">Sort by Hours</option>
                <option value="name">Sort by Name</option>
                <option value="shifts">Sort by Shifts</option>
              </select>
            </div>
          </div>
        </div>

        {/* Volunteers List */}
        <div className="modern-volunteers-section">
          {loading ? (
            <div className="modern-loading-state">
              <div className="modern-loading-spinner"></div>
              <p>Loading volunteer roster...</p>
            </div>
          ) : sortedVolunteers.length === 0 ? (
            <div className="modern-empty-state">
              <div className="modern-empty-icon">👥</div>
              <h3 className="modern-empty-title">
                {searchTerm ? "No matching volunteers found" : "No volunteers yet"}
              </h3>
              <p className="modern-empty-description">
                {searchTerm
                  ? `No volunteers match "${searchTerm}". Try a different search term.`
                  : "Volunteers will appear here once they sign up for shifts."}
              </p>
              {searchTerm && (
                <button onClick={() => setSearchTerm("")} className="modern-empty-action">
                  <span className="modern-button-icon">🔍</span>
                  Clear Search
                </button>
              )}
            </div>
          ) : (
            <div className="modern-volunteers-grid">
              {sortedVolunteers.map((vol) => {
                const userId = vol._id || vol.id;
                const phone = phoneNumbers[userId];

                return (
                  <div key={userId} className="modern-volunteer-card">
                    <div className="modern-volunteer-header">
                      <div className="modern-volunteer-avatar">
                        {(vol.preferredName || vol.name || "?").charAt(0).toUpperCase()}
                      </div>
                      <div className="modern-volunteer-info">
                        <h3 className="modern-volunteer-name">
                          {vol.preferredName || vol.name || vol.email}
                          {vol.isRestricted && <span title="Restricted"> {" "}🚫</span>}
                          {vol.noShow && <span title="No-show on record"> {" "}⚠️</span>}
                        </h3>
                        <p className="modern-volunteer-email">📧 {vol.email}</p>
                        {phone && (
                          <a href={`tel:${phone}`} className="modern-volunteer-phone">
                            📞 {phone}
                          </a>
                        )}
                      </div>
                      <div className="modern-volunteer-stats">
                        <div className="modern-stat-item">
                          <span className="modern-stat-number">{vol.totalHours || 0}</span>
                          <span className="modern-stat-label">hours</span>
                        </div>
                        <div className="modern-stat-item">
                          <span className="modern-stat-number">{vol.shifts?.length || 0}</span>
                          <span className="modern-stat-label">shifts</span>
                        </div>
                      </div>
                    </div>

                    {(isAdmin || isLead) && (
                      <div className="modern-restriction-panel" style={{ marginTop: 8 }}>
                        <div
                          className="modern-restriction-grid"
                          style={{ display: "grid", gap: 8, gridTemplateColumns: "1fr 1fr" }}
                        >
                          <label className="modern-field">
                            <span className="modern-field-label">No-show on record</span>
                            <input
                              type="checkbox"
                              checked={!!vol.noShow}
                              onChange={(e) => toggleNoShow(userId, e.target.checked)}
                            />
                          </label>

                          <label className="modern-field">
                            <span className="modern-field-label">Restrict from signups</span>
                            <input
                              type="checkbox"
                              checked={!!vol.isRestricted}
                              onChange={(e) => toggleRestrict(userId, e.target.checked)}
                            />
                          </label>
                        </div>
                      </div>
                    )}

{vol.shifts && vol.shifts.length > 0 ? (
  <div className="modern-volunteer-shifts">
    <h4 className="modern-shifts-title">📅 Upcoming Shifts ({vol.shifts.length})</h4>
    {(() => {
      // Group by date
      const byDate = vol.shifts.reduce((acc, s) => {
        if (!acc[s.date]) acc[s.date] = [];
        acc[s.date].push(s);
        return acc;
      }, {});

      // Sort dates ascending
      const sortedDates = Object.keys(byDate).sort();

      return sortedDates.map((date) => {
        // Sort shifts within day by start time
        const dayShifts = byDate[date].sort((a, b) =>
          a.startTime.localeCompare(b.startTime)
        );

        // Mark each shift as continuing from previous (same role + adjacent times)
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
              {new Date(date + "T12:00:00").toLocaleDateString(undefined, {
                weekday: "long",
                month: "short",
                day: "numeric",
              })}
            </div>
            <div className="modern-day-shifts">
              {annotated.map((shift) => (
                <div
                  key={shift.id}
                  className={`modern-day-shift ${shift.continuesFromPrev ? "continues-from" : ""} ${shift.continuesToNext ? "continues-to" : ""}`}
                >
                  <div className="modern-day-shift-role">{shift.role}</div>
                  <div className="modern-day-shift-time">
                    🕒 {formatTime(shift.startTime)} – {formatTime(shift.endTime)}
                  </div>
                </div>
              ))}
            </div>
          </div>
        );
      });
    })()}
  </div>
) : (
  <div className="modern-no-shifts">
    <span className="modern-no-shifts-icon">📅</span>
    <span className="modern-no-shifts-text">No upcoming shifts</span>
  </div>
)}
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