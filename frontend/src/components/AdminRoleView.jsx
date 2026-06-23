import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "./Header";
import ShiftForm from "./ShiftForm";
import { hasRole } from "../utils/authUtils";
import "../styles/adminRoleView.css";

const API_BASE = process.env.REACT_APP_API_BASE;

export default function AdminRoleView() {
  const { roleName: encodedRoleName } = useParams();
  const roleName = decodeURIComponent(encodedRoleName);

  const [shifts, setShifts] = useState([]);
  const [roleInfo, setRoleInfo] = useState(null);
  const [activeEvent, setActiveEvent] = useState(null);
  const [eventDates, setEventDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [showAddForm, setShowAddForm] = useState(false);
  const [showRoleDetails, setShowRoleDetails] = useState(false);
  const [filter, setFilter] = useState("all");
  const [editingShift, setEditingShift] = useState(null);
  const [editFormData, setEditFormData] = useState({});
  const [deletingShift, setDeletingShift] = useState(null);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");

  const isAdminOrLead = hasRole("Admin") || hasRole("Lead");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventRes, rolesRes, shiftsRes] = await Promise.all([
        fetch(`${API_BASE}/api/events/active`),
        fetch(`${API_BASE}/api/shiftroles`),
        fetch(`${API_BASE}/api/volunteer`),
      ]);

      if (!eventRes.ok) throw new Error("Failed to load event");
      const event = await eventRes.json();
      setActiveEvent(event);

      const dates = [];
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        dates.push(d.toISOString().split("T")[0]);
      }
      setEventDates(dates);
      if (!selectedDate && dates.length > 0) {
        setSelectedDate(dates[0]);
      }

      if (rolesRes.ok) {
        const roles = await rolesRes.json();
        const role = roles.find((r) => r.name === roleName);
        setRoleInfo(role || null);
      }

      if (shiftsRes.ok) {
        const allShifts = await shiftsRes.json();
        setShifts(allShifts.filter((s) => s.role === roleName));
      }
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleName]);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  const formatTime = (timeStr) => {
    const safe = String(timeStr ?? "").trim();
    const parts = safe.includes(":") ? safe.split(":") : [safe, "0"];
    let h = Number(parts[0]);
    let m = Number(parts[1] ?? 0);
    if (Number.isNaN(h)) h = 0;
    if (Number.isNaN(m)) m = 0;
    const suffix = h >= 12 ? "PM" : "AM";
    const display = ((h + 11) % 12) + 1;
    return `${display}:${String(m).padStart(2, "0")} ${suffix}`;
  };

  const formatDateLabel = (date) => {
    const [year, month, day] = date.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return localDate.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
  };

  const formatPhone = (phone) => {
    if (!phone) return null;
    const cleaned = phone.replace(/\D/g, "");
    if (cleaned.length === 10) {
      return `(${cleaned.slice(0, 3)}) ${cleaned.slice(3, 6)}-${cleaned.slice(6)}`;
    }
    return phone;
  };

  const stats = shifts.reduce(
    (acc, s) => {
      const filled = s.volunteersRegistered?.length || 0;
      const needed = s.volunteersNeeded || 0;
      acc.totalShifts += 1;
      acc.totalCapacity += filled + needed;
      acc.totalFilled += filled;
      acc.totalUnfilled += needed;
      if (needed > 0 && filled === 0) acc.critical += 1;
      return acc;
    },
    { totalShifts: 0, totalCapacity: 0, totalFilled: 0, totalUnfilled: 0, critical: 0 }
  );

  const coveragePct =
    stats.totalCapacity > 0 ? Math.round((stats.totalFilled / stats.totalCapacity) * 100) : 0;

  const dayShifts = shifts
    .filter((s) => s.date === selectedDate)
    .filter((s) => {
      const filled = s.volunteersRegistered?.length || 0;
      const needed = s.volunteersNeeded || 0;
      if (filter === "critical") return needed > 0 && filled === 0;
      if (filter === "needsHelp") return needed > 0;
      return true;
    })
    .sort((a, b) => a.startTime.localeCompare(b.startTime));

  const handleEdit = (shift) => {
    setEditingShift(shift._id);
    setEditFormData({
      date: shift.date,
      startTime: shift.startTime,
      endTime: shift.endTime,
      volunteersNeeded: shift.volunteersNeeded,
      notes: shift.notes || "",
    });
  };

  const handleCancelEdit = () => {
    setEditingShift(null);
    setEditFormData({});
  };

  const handleSaveEdit = async () => {
    try {
      const res = await fetch(`${API_BASE}/api/volunteer/${editingShift}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(editFormData),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const updated = await res.json();
      setShifts((prev) => prev.map((s) => (s._id === editingShift ? { ...s, ...updated } : s)));
      handleCancelEdit();
    } catch (e) {
      alert(`Failed to save: ${e.message}`);
    }
  };

  const openDeleteDialog = (shift) => {
    setDeletingShift(shift);
    setDeleteConfirmText("");
  };

  const closeDeleteDialog = () => {
    setDeletingShift(null);
    setDeleteConfirmText("");
  };

  const handleConfirmDelete = async () => {
    if (!deletingShift) return;
    const hasVolunteers = (deletingShift.volunteersRegistered?.length || 0) > 0;
    if (hasVolunteers && deleteConfirmText !== "DELETE") return;

    try {
      const res = await fetch(`${API_BASE}/api/volunteer/${deletingShift._id}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShifts((prev) => prev.filter((s) => s._id !== deletingShift._id));
      closeDeleteDialog();
    } catch (e) {
      alert(`Failed to delete: ${e.message}`);
    }
  };

  if (!isAdminOrLead) {
    return (
      <div className="modern-page-container">
        <Header />
        <div className="modern-content-wrapper">
          <p>You don't have permission to view this page.</p>
        </div>
      </div>
    );
  }

  return (
    <div className="modern-page-container">
      <Header />

      <div className="modern-header-section">
        <div className="modern-header-content">
          <Link to="/admin" className="role-view-back">← All departments</Link>
          <h1 className="modern-page-title">{roleName}</h1>
        </div>
      </div>

      <div className="modern-content-wrapper">
        {loading ? (
          <div className="modern-loading-state">
            <div className="modern-loading-spinner" />
            <p>Loading…</p>
          </div>
        ) : error ? (
          <p className="modern-error">{error}</p>
        ) : (
          <>
            <div className="role-view-stats">
              <div className="role-view-stat">
                <span className="role-view-stat-number">{coveragePct}%</span>
                <span className="role-view-stat-label">Coverage</span>
              </div>
              <div className="role-view-stat">
                <span className="role-view-stat-number">{stats.totalShifts}</span>
                <span className="role-view-stat-label">Total shifts</span>
              </div>
              <div className="role-view-stat">
                <span className="role-view-stat-number">{stats.totalUnfilled}</span>
                <span className="role-view-stat-label">Open spots</span>
              </div>
              <div className="role-view-stat critical">
                <span className="role-view-stat-number">{stats.critical}</span>
                <span className="role-view-stat-label">Critical (0 vols)</span>
              </div>
            </div>

            {roleInfo && (roleInfo.responsibilities || roleInfo.location || roleInfo.physicalRequirements) && (
              <div className="role-view-details">
                <button
                  className="role-view-details-toggle"
                  onClick={() => setShowRoleDetails((v) => !v)}
                >
                  {showRoleDetails ? "▼" : "▶"} Role details
                </button>
                {showRoleDetails && (
                  <div className="role-view-details-content">
                    {roleInfo.responsibilities && (
                      <p><strong>Responsibilities:</strong> {roleInfo.responsibilities}</p>
                    )}
                    {roleInfo.location && (
                      <p><strong>Location:</strong> {roleInfo.location}</p>
                    )}
                    {roleInfo.physicalRequirements && (
                      <p><strong>Physical requirements:</strong> {roleInfo.physicalRequirements}</p>
                    )}
                  </div>
                )}
              </div>
            )}

            <div className="role-view-toolbar">
              <div className="role-view-filters">
                <button
                  className={`role-view-filter ${filter === "all" ? "active" : ""}`}
                  onClick={() => setFilter("all")}
                >
                  All
                </button>
                <button
                  className={`role-view-filter ${filter === "needsHelp" ? "active" : ""}`}
                  onClick={() => setFilter("needsHelp")}
                >
                  Needs help
                </button>
                <button
                  className={`role-view-filter ${filter === "critical" ? "active" : ""}`}
                  onClick={() => setFilter("critical")}
                >
                  Critical
                </button>
              </div>
              <button
                className="role-view-add-button"
                onClick={() => setShowAddForm((v) => !v)}
              >
                {showAddForm ? "Cancel" : "➕ Add New Shift"}
              </button>
            </div>

            {showAddForm && (
              <div className="role-view-add-form">
                <ShiftForm
                  existingShifts={shifts}
                  lockedRole={roleName}
                  onShiftCreated={(newShift) => {
                    setShifts((prev) => [...prev, newShift]);
                    setShowAddForm(false);
                  }}
                />
              </div>
            )}

            <div className="role-view-day-tabs">
              {eventDates.map((d) => {
                const dayCritical = shifts.filter((s) => {
                  if (s.date !== d) return false;
                  const filled = s.volunteersRegistered?.length || 0;
                  return (s.volunteersNeeded || 0) > 0 && filled === 0;
                }).length;
                return (
                  <button
                    key={d}
                    className={`role-view-day-tab ${selectedDate === d ? "active" : ""}`}
                    onClick={() => setSelectedDate(d)}
                  >
                    <span>{formatDateLabel(d)}</span>
                    {dayCritical > 0 && (
                      <span className="role-view-day-flag" title={`${dayCritical} critical`}>!</span>
                    )}
                  </button>
                );
              })}
            </div>

            <TimelineView
              shifts={dayShifts}
              selectedDate={selectedDate}
              editingShift={editingShift}
              editFormData={editFormData}
              setEditFormData={setEditFormData}
              eventDates={eventDates}
              onEdit={handleEdit}
              onCancelEdit={handleCancelEdit}
              onSaveEdit={handleSaveEdit}
              onDelete={openDeleteDialog}
              formatTime={formatTime}
              formatDateLabel={formatDateLabel}
              formatPhone={formatPhone}
            />
          </>
        )}
      </div>

      {deletingShift && (() => {
        const filled = deletingShift.volunteersRegistered?.length || 0;
        return (
          <div className="role-view-modal-backdrop" onClick={closeDeleteDialog}>
            <div className="role-view-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete this shift?</h3>
              <p>
                <strong>{formatDateLabel(deletingShift.date)}</strong> at{" "}
                {formatTime(deletingShift.startTime)}–{formatTime(deletingShift.endTime)}
              </p>

              {filled > 0 ? (
                <>
                  <div className="role-view-edit-warning danger">
                    ⚠️ <strong>Wait!</strong> {filled} volunteer{filled !== 1 ? "s are" : " is"} signed up for this shift. Deleting will remove them from this shift entirely. They will NOT be notified — you must contact them yourself.
                  </div>

                  <div className="role-view-contact-list">
                    <strong>Affected volunteers:</strong>
                    <p className="role-view-contact-hint">👇 Tap a phone or email to reach out</p>
                    <ul>
                      {deletingShift.volunteersRegistered.map((v) => (
                        <VolunteerContactCard
                          key={v?._id || v?.id || v?.email}
                          volunteer={v}
                          formatPhone={formatPhone}
                        />
                      ))}
                    </ul>
                  </div>

                  <label>
                    Type <strong>DELETE</strong> to confirm:
                    <input
                      type="text"
                      value={deleteConfirmText}
                      onChange={(e) => setDeleteConfirmText(e.target.value)}
                      autoFocus
                    />
                  </label>

                  <div className="role-view-modal-actions">
                    <button onClick={closeDeleteDialog}>Cancel</button>
                    <button
                      className="role-view-delete"
                      onClick={handleConfirmDelete}
                      disabled={deleteConfirmText !== "DELETE"}
                    >
                      Delete shift
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>No volunteers are signed up for this shift, so it's safe to delete.</p>
                  <div className="role-view-modal-actions">
                    <button onClick={closeDeleteDialog}>Cancel</button>
                    <button className="role-view-delete" onClick={handleConfirmDelete}>
                      Delete shift
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        );
      })()}
    </div>
  );
}

// ---------- Timeline subcomponent ----------

const HOUR_START = 7;
const HOUR_END = 26;
const HOUR_HEIGHT = 60;

function timeToHours(timeStr, isEndTime = false, startHours = null) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  let hours = h + (m || 0) / 60;
  if (isEndTime && startHours !== null && hours < startHours) {
    hours += 24;
  }
  return hours;
}

function TimelineView({
  shifts,
  editingShift,
  editFormData,
  setEditFormData,
  eventDates,
  onEdit,
  onCancelEdit,
  onSaveEdit,
  onDelete,
  formatTime,
  formatDateLabel,
  formatPhone,
}) {
  const [expandedShift, setExpandedShift] = useState(null);

  if (shifts.length === 0) {
    return <div className="timeline-empty">No shifts match this filter for the selected day.</div>;
  }

  const positioned = shifts
    .map((s) => {
      const start = timeToHours(s.startTime);
      const end = timeToHours(s.endTime, true, start);
      return { shift: s, start, end };
    })
    .sort((a, b) => a.start - b.start);

  const columns = [];
  positioned.forEach((p) => {
    let placed = false;
    for (let i = 0; i < columns.length; i++) {
      const lastInCol = columns[i][columns[i].length - 1];
      if (lastInCol.end <= p.start) {
        columns[i].push(p);
        p.column = i;
        placed = true;
        break;
      }
    }
    if (!placed) {
      p.column = columns.length;
      columns.push([p]);
    }
  });

  const totalColumns = Math.max(1, columns.length);

  const hourLabels = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const displayHour = h % 24;
    const suffix = displayHour >= 12 ? "PM" : "AM";
    const display = ((displayHour + 11) % 12) + 1;
    hourLabels.push({ hour: h, label: `${display} ${suffix}` });
  }

  const totalHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

  return (
    <div className="timeline">
      <div className="timeline-hours" style={{ height: `${totalHeight}px` }}>
        {hourLabels.map((hl) => (
          <div
            key={hl.hour}
            className="timeline-hour-label"
            style={{ top: `${(hl.hour - HOUR_START) * HOUR_HEIGHT}px` }}
          >
            {hl.label}
          </div>
        ))}
      </div>

      <div className="timeline-grid" style={{ height: `${totalHeight}px` }}>
        {hourLabels.map((hl) => (
          <div
            key={hl.hour}
            className="timeline-gridline"
            style={{ top: `${(hl.hour - HOUR_START) * HOUR_HEIGHT}px` }}
          />
        ))}

        {positioned.map(({ shift, start, end, column }) => {
          const filled = shift.volunteersRegistered?.length || 0;
          const needed = shift.volunteersNeeded || 0;
          const totalSlots = filled + needed;
          const statusClass = needed === 0 ? "filled" : filled === 0 ? "critical" : "partial";

          const top = (start - HOUR_START) * HOUR_HEIGHT;
          const height = (end - start) * HOUR_HEIGHT;
          const widthPct = 100 / totalColumns;
          const leftPct = column * widthPct;

          const isExpanded = expandedShift === shift._id;
          const isEditing = editingShift === shift._id;

          if (isEditing) {
            return (
              <div
                key={shift._id}
                className={`timeline-shift editing ${statusClass}`}
                style={{
                  top: `${top}px`,
                  height: `${Math.max(height, 200)}px`,
                  left: `${leftPct}%`,
                  width: `calc(${widthPct}% - 8px)`,
                  zIndex: 5,
                }}
              >
                <ShiftEditForm
                  shift={shift}
                  formData={editFormData}
                  setFormData={setEditFormData}
                  eventDates={eventDates}
                  onCancel={onCancelEdit}
                  onSave={onSaveEdit}
                  formatDateLabel={formatDateLabel}
                  formatPhone={formatPhone}
                />
              </div>
            );
          }

          return (
            <div
              key={shift._id}
              className={`timeline-shift ${statusClass} ${isExpanded ? "expanded" : ""}`}
              style={{
                top: `${top}px`,
                height: `${height}px`,
                left: `${leftPct}%`,
                width: `calc(${widthPct}% - 8px)`,
                zIndex: isExpanded ? 4 : 1,
              }}
            >
              <div className="timeline-shift-header">
                <span className="timeline-shift-time">
                  {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
                </span>
                <div className="timeline-shift-actions" onClick={(e) => e.stopPropagation()}>
                  <div className="timeline-shift-actions-buttons">
                    <button onClick={(e) => { e.stopPropagation(); onEdit(shift); }}>
                      Edit
                    </button>
                    <button
                      className="role-view-delete"
                      onClick={(e) => { e.stopPropagation(); onDelete(shift); }}
                    >
                      Delete
                    </button>
                  </div>
                </div>
                <span className="timeline-shift-count">
                  {filled}/{totalSlots}
                </span>
              </div>

              <div className="timeline-shift-body" onClick={(e) => e.stopPropagation()}>
                {shift.volunteersRegistered?.length > 0 ? (
                  <ul className="timeline-vol-list">
                    {shift.volunteersRegistered.map((v) => (
                      <VolunteerContactCard
                        key={v?._id || v?.id || v?.email}
                        volunteer={v}
                        formatPhone={formatPhone}
                      />
                    ))}
                  </ul>
                ) : (
                  <p className="timeline-no-vols">No volunteers signed up</p>
                )}

                {shift.notes && <p className="timeline-notes">📌 {shift.notes}</p>}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShiftEditForm({ shift, formData, setFormData, eventDates, onCancel, onSave, formatDateLabel, formatPhone }) {
  const filled = shift.volunteersRegistered?.length || 0;
  return (
    <div className="timeline-edit-form" onClick={(e) => e.stopPropagation()}>
      {filled > 0 && (
        <>
          <div className="role-view-edit-warning">
            ⚠️ <strong>Heads up:</strong> {filled} volunteer{filled !== 1 ? "s" : ""} signed up. Changes won't notify them — please contact them after saving.
          </div>
          <div className="role-view-contact-list">
            <strong>Reach out to:</strong>
            <p className="role-view-contact-hint">👇 Tap a phone or email to reach out</p>
            <ul>
              {shift.volunteersRegistered.map((v) => (
                <VolunteerContactCard
                  key={v?._id || v?.id || v?.email}
                  volunteer={v}
                  formatPhone={formatPhone}
                />
              ))}
            </ul>
          </div>
        </>
      )}

      <div className="role-view-edit-grid">
        <label>
          Date
          <select
            value={formData.date}
            onChange={(e) => setFormData((p) => ({ ...p, date: e.target.value }))}
          >
            {eventDates.map((d) => (
              <option key={d} value={d}>{formatDateLabel(d)}</option>
            ))}
          </select>
        </label>
        <label>
          Start
          <input type="time" value={formData.startTime}
            onChange={(e) => setFormData((p) => ({ ...p, startTime: e.target.value }))} />
        </label>
        <label>
          End
          <input type="time" value={formData.endTime}
            onChange={(e) => setFormData((p) => ({ ...p, endTime: e.target.value }))} />
        </label>
        <label>
          Volunteers needed
          <input type="number" min="1" value={formData.volunteersNeeded}
            onChange={(e) => setFormData((p) => ({ ...p, volunteersNeeded: parseInt(e.target.value, 10) || 1 }))} />
        </label>
      </div>
      <label className="role-view-edit-notes-label">
        Notes
        <textarea
          value={formData.notes}
          onChange={(e) => setFormData((p) => ({ ...p, notes: e.target.value }))}
          rows={2}
        />
      </label>
      <div className="role-view-edit-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="modern-primary-button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function VolunteerContactCard({ volunteer, formatPhone }) {
  const v = volunteer || {};
  const name = v.preferredName || v.name || v.email || "Volunteer";
  const phone = v.phone;
  const email = v.email;
  const phoneHref = phone ? `tel:${phone.replace(/\D/g, "")}` : null;
  const emailHref = email ? `mailto:${email}` : null;

  return (
    <li className="volunteer-contact-card">
      <div className="volunteer-contact-name">👤 {name}</div>
      <div className="volunteer-contact-methods">
        {phone && (
          <a href={phoneHref} className="volunteer-contact-link phone"><span className="volunteer-contact-icon">📞</span><span>{formatPhone(phone)}</span></a>
        )}
        {email && (
          <a href={emailHref} className="volunteer-contact-link email"><span className="volunteer-contact-icon">✉️</span><span>{email}</span></a>
        )}
        {!phone && !email && (
          <span className="volunteer-contact-none">No contact info on file</span>
        )}
      </div>
    </li>
  );
}