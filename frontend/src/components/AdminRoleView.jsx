import React, { useCallback, useEffect, useState } from "react";
import { Link, useParams } from "react-router-dom";
import Header from "./Header";
import ShiftForm from "./ShiftForm";
import { hasRole } from "../utils/authUtils";
import "../styles/adminRoleView.css";
import "../styles/roleRequests.css";

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

  // "Bad shift" cleanup: pull one volunteer off a shift (with a notice), or
  // -- folded into the Delete dialog below -- move everyone on a shift to a
  // different one, or remove them all, before the shift itself goes away.
  // Calls the removeVolunteerFromShift / reassignShiftVolunteers routes
  // added alongside the notification system.
  const [removingVolunteerId, setRemovingVolunteerId] = useState(null);

  // Delete dialog sub-state: once a shift with volunteers is opened for
  // deletion, deleteMode picks which path they take before anything is
  // deleted -- null means "show the choice", not yet decided.
  const [deleteMode, setDeleteMode] = useState(null);
  const [reassignTargetId, setReassignTargetId] = useState("");
  const [deleteSubmitting, setDeleteSubmitting] = useState(false);

  // Only relevant when roleInfo.restricted is true -- see the two panels
  // rendered further down and loadRoleRequestData below.
  const [pendingRequests, setPendingRequests] = useState([]);
  const [approvedVolunteers, setApprovedVolunteers] = useState([]);
  const [roleRequestsLoading, setRoleRequestsLoading] = useState(false);
  const [decidingRequestId, setDecidingRequestId] = useState(null);
  const [revokingUserId, setRevokingUserId] = useState(null);

  const isAdminOrLead = hasRole("Admin") || hasRole("Lead");

  // These two endpoints require a Bearer token (authenticateUser +
  // requireLeadOrAdmin on the backend) -- unlike loadAll's fetches above,
  // which hit unauthenticated public routes. Don't copy this pattern onto
  // the other fetches in this file without also checking their routes.
  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

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

  // Only fetch once we know whether this role is restricted -- no point
  // hitting these endpoints (or showing the panels) for an open role.
  const loadRoleRequestData = useCallback(async () => {
    if (!roleInfo?.restricted) return;
    setRoleRequestsLoading(true);
    try {
      const [pendingRes, approvedRes] = await Promise.all([
        fetch(`${API_BASE}/api/admin/roles/${encodeURIComponent(roleName)}/role-requests`, {
          headers: authHeader(),
        }),
        fetch(`${API_BASE}/api/admin/roles/${encodeURIComponent(roleName)}/approved-volunteers`, {
          headers: authHeader(),
        }),
      ]);
      if (pendingRes.ok) setPendingRequests(await pendingRes.json());
      if (approvedRes.ok) setApprovedVolunteers(await approvedRes.json());
    } catch (e) {
      console.error("Error loading role request data:", e);
    } finally {
      setRoleRequestsLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [roleName, roleInfo?.restricted]);

  useEffect(() => {
    loadRoleRequestData();
  }, [loadRoleRequestData]);

  const handleApproveRequest = async (requestId) => {
    setDecidingRequestId(requestId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/role-requests/${requestId}/approve`, {
        method: "POST",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
      loadRoleRequestData(); // refresh "Currently Approved" too
    } catch (e) {
      alert(`Failed to approve: ${e.message}`);
    } finally {
      setDecidingRequestId(null);
    }
  };

  const handleDenyRequest = async (requestId) => {
    setDecidingRequestId(requestId);
    try {
      const res = await fetch(`${API_BASE}/api/admin/role-requests/${requestId}/deny`, {
        method: "POST",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setPendingRequests((prev) => prev.filter((r) => r._id !== requestId));
    } catch (e) {
      alert(`Failed to deny: ${e.message}`);
    } finally {
      setDecidingRequestId(null);
    }
  };

  // Approve a volunteer who's already signed up for a shift under this
  // restricted role but was never approved (signed up before it became
  // restricted, or never submitted a RoleRequest). Same endpoint the
  // revoke action below uses, just with approved: true -- see userRoutes
  // for the notification this triggers.
  const handleApproveExisting = async (volunteer) => {
    const name = volunteer.preferredName || volunteer.email || "this volunteer";
    if (!window.confirm(`Approve ${name} for ${roleName}?`)) return;
    setRevokingUserId(volunteer._id); // reuse the same "busy" flag/spinner path
    try {
      const res = await fetch(`${API_BASE}/api/users/${volunteer._id}/approved-roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ roleName, approved: true }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShifts((prev) =>
        prev.map((s) => ({
          ...s,
          volunteersRegistered: (s.volunteersRegistered || []).map((v) =>
            v._id === volunteer._id
              ? { ...v, approvedRoles: [...new Set([...(v.approvedRoles || []), roleName])] }
              : v
          ),
        }))
      );
      loadRoleRequestData(); // refresh "Currently Approved" panel too
    } catch (e) {
      alert(`Failed to approve: ${e.message}`);
    } finally {
      setRevokingUserId(null);
    }
  };

  const handleRevokeApproval = async (userId) => {
    if (!window.confirm("Revoke this volunteer's approval for this role?")) return;
    setRevokingUserId(userId);
    try {
      const res = await fetch(`${API_BASE}/api/users/${userId}/approved-roles`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json", ...authHeader() },
        body: JSON.stringify({ roleName, approved: false }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setApprovedVolunteers((prev) => prev.filter((v) => v._id !== userId));
    } catch (e) {
      alert(`Failed to revoke: ${e.message}`);
    } finally {
      setRevokingUserId(null);
    }
  };

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

  // NOTE: "needed" (shift.volunteersNeeded) is the shift's TOTAL target
  // headcount -- the same field and the same meaning the backend's
  // signUpForFlexShift uses to decide a shift is full ("Shift full" once
  // volunteersRegistered.length >= volunteersNeeded). totalCapacity/
  // totalUnfilled below previously summed filled + needed and needed
  // directly, which double-counted people already signed up. A shift
  // sitting at exactly 3/3 was being reported as still needing 3 more.
  const stats = shifts.reduce(
    (acc, s) => {
      const filled = s.volunteersRegistered?.length || 0;
      const needed = s.volunteersNeeded || 0;
      const remaining = Math.max(0, needed - filled);
      acc.totalShifts += 1;
      acc.totalCapacity += needed;
      acc.totalFilled += filled;
      acc.totalUnfilled += remaining;
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
      if (filter === "needsHelp") return filled < needed;
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
      setShifts((prev) =>
        prev.map((s) =>
          s._id === editingShift
            ? { ...s, ...updated, volunteersRegistered: s.volunteersRegistered }
            : s
        )
      );
      handleCancelEdit();
    } catch (e) {
      alert(`Failed to save: ${e.message}`);
    }
  };

  // One dialog handles all three "something's wrong with this shift" paths:
  // - no volunteers: just delete it
  // - volunteers, choosing "Move": reassignShiftVolunteers moves everyone
  //   to another shift and deletes this one in a single call
  // - volunteers, choosing "Remove": removeVolunteerFromShift notifies and
  //   removes each person, then the shift itself is deleted once it's empty
  const openDeleteDialog = (shift) => {
    setDeletingShift(shift);
    setDeleteConfirmText("");
    setDeleteMode(null);
    setReassignTargetId("");
  };

  const closeDeleteDialog = () => {
    setDeletingShift(null);
    setDeleteConfirmText("");
    setDeleteMode(null);
    setReassignTargetId("");
  };

  const reassignTargetOptions = deletingShift
    ? shifts
        .filter((s) => s._id !== deletingShift._id)
        .sort((a, b) => (a.date + a.startTime).localeCompare(b.date + b.startTime))
    : [];

  // Plain delete -- no volunteers on the shift, nothing to notify.
  const handleConfirmDelete = async () => {
    if (!deletingShift) return;
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

  // "Move" path: move everyone to the chosen target shift; the backend
  // deletes this shift as part of the same call.
  const handleConfirmMove = async () => {
    if (!deletingShift || !reassignTargetId) return;
    setDeleteSubmitting(true);
    try {
      const res = await fetch(`${API_BASE}/api/volunteer/${deletingShift._id}/reassign`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ targetShiftId: reassignTargetId }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const result = await res.json();
      closeDeleteDialog();
      await loadAll(); // shift topology changed (source deleted, target headcount changed)
      const skippedNote =
        result.skipped?.length > 0 ? ` (${result.skipped.length} skipped — see console)` : "";
      if (result.skipped?.length > 0) console.log("Reassign skipped:", result.skipped);
      alert(`Moved ${result.moved?.length || 0} volunteer(s) to the new shift.${skippedNote}`);
    } catch (e) {
      alert(`Failed to move volunteers: ${e.message}`);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // "Remove" path: notify + remove each volunteer, then delete the shift
  // once it's empty. Requires typed DELETE since there's no replacement.
  const handleConfirmRemoveAndDelete = async () => {
    if (!deletingShift || deleteConfirmText !== "DELETE") return;
    setDeleteSubmitting(true);
    try {
      const volunteers = deletingShift.volunteersRegistered || [];
      for (const v of volunteers) {
        const res = await fetch(
          `${API_BASE}/api/volunteer/${deletingShift._id}/remove-volunteer`,
          {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ userId: v._id, reason: "This shift was cancelled" }),
          }
        );
        if (!res.ok) throw new Error(`HTTP ${res.status} removing ${v.email || v._id}`);
      }

      const delRes = await fetch(`${API_BASE}/api/volunteer/${deletingShift._id}`, {
        method: "DELETE",
      });
      if (!delRes.ok) throw new Error(`HTTP ${delRes.status} deleting shift`);

      setShifts((prev) => prev.filter((s) => s._id !== deletingShift._id));
      closeDeleteDialog();
    } catch (e) {
      alert(`Failed partway through removing volunteers: ${e.message}. Check the shift before retrying.`);
    } finally {
      setDeleteSubmitting(false);
    }
  };

  // Pull a single volunteer off a shift without deleting it (e.g. an
  // unapproved signup on a restricted role). Sends them a notice.
  const handleRemoveVolunteer = async (shift, volunteer) => {
    const name = volunteer.preferredName || volunteer.email || "this volunteer";
    if (!window.confirm(`Remove ${name} from this shift? They'll be notified.`)) return;

    const reason = window.prompt(
      "Optional: a short reason to include in their notice (leave blank to skip)",
      ""
    );
    if (reason === null) return; // they hit Cancel on the prompt itself

    setRemovingVolunteerId(volunteer._id);
    try {
      const res = await fetch(`${API_BASE}/api/volunteer/${shift._id}/remove-volunteer`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId: volunteer._id, reason: reason || undefined }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setShifts((prev) =>
        prev.map((s) =>
          s._id === shift._id
            ? {
                ...s,
                volunteersRegistered: s.volunteersRegistered.filter(
                  (v) => v._id !== volunteer._id
                ),
              }
            : s
        )
      );
    } catch (e) {
      alert(`Failed to remove volunteer: ${e.message}`);
    } finally {
      setRemovingVolunteerId(null);
    }
  };

  const editingShiftObj = editingShift ? shifts.find((s) => s._id === editingShift) : null;

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

            {roleInfo?.restricted && (
              <>
                <div className="role-request-panel">
                  <h3 className="role-request-panel-title">
                    🔒 Pending Access Requests {pendingRequests.length > 0 && `(${pendingRequests.length})`}
                  </h3>
                  {roleRequestsLoading ? (
                    <p className="role-request-empty">Loading…</p>
                  ) : pendingRequests.length === 0 ? (
                    <p className="role-request-empty">No pending requests for this role.</p>
                  ) : (
                    <div className="role-request-list">
                      {pendingRequests.map((reqItem) => {
                        const volunteer = reqItem.user || {};
                        const deciding = decidingRequestId === reqItem._id;
                        return (
                          <div key={reqItem._id} className="role-request-row">
                            <div className="role-request-who">
                              <span className="role-request-name">
                                {volunteer.preferredName || volunteer.email || "Unknown volunteer"}
                              </span>
                              <span className="role-request-contact">
                                {volunteer.email}{volunteer.phone ? ` · ${formatPhone(volunteer.phone)}` : ""}
                              </span>
                            </div>
                            <div className="role-request-actions">
                              <button
                                className="role-request-approve-button"
                                disabled={deciding}
                                onClick={() => handleApproveRequest(reqItem._id)}
                              >
                                {deciding ? "…" : "Approve"}
                              </button>
                              <button
                                className="role-request-deny-button"
                                disabled={deciding}
                                onClick={() => handleDenyRequest(reqItem._id)}
                              >
                                {deciding ? "…" : "Deny"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>

                <div className="role-request-panel">
                  <h3 className="role-request-panel-title">
                    ✅ Currently Approved {approvedVolunteers.length > 0 && `(${approvedVolunteers.length})`}
                  </h3>
                  {roleRequestsLoading ? (
                    <p className="role-request-empty">Loading…</p>
                  ) : approvedVolunteers.length === 0 ? (
                    <p className="role-request-empty">No one is approved for this role yet.</p>
                  ) : (
                    <div className="role-request-list">
                      {approvedVolunteers.map((volunteer) => {
                        const revoking = revokingUserId === volunteer._id;
                        return (
                          <div key={volunteer._id} className="role-request-row">
                            <div className="role-request-who">
                              <span className="role-request-name">
                                {volunteer.preferredName || volunteer.email}
                              </span>
                              <span className="role-request-contact">
                                {volunteer.email}{volunteer.phone ? ` · ${formatPhone(volunteer.phone)}` : ""}
                              </span>
                            </div>
                            <div className="role-request-actions">
                              <button
                                className="role-request-revoke-button"
                                disabled={revoking}
                                onClick={() => handleRevokeApproval(volunteer._id)}
                              >
                                {revoking ? "…" : "Revoke"}
                              </button>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  )}
                </div>
              </>
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
              onEdit={handleEdit}
              onDelete={openDeleteDialog}
              onRemoveVolunteer={handleRemoveVolunteer}
              onApproveVolunteer={handleApproveExisting}
              removingVolunteerId={removingVolunteerId}
              formatTime={formatTime}
              formatPhone={formatPhone}
              restricted={!!roleInfo?.restricted}
            />
          </>
        )}
      </div>

      {editingShiftObj && (
        <div className="role-view-modal-backdrop" onClick={handleCancelEdit}>
          <div
            className="role-view-modal role-view-modal-edit"
            onClick={(e) => e.stopPropagation()}
          >
            <h3>Edit shift</h3>
            <p>
              <strong>{formatDateLabel(editingShiftObj.date)}</strong> at{" "}
              {formatTime(editingShiftObj.startTime)}–{formatTime(editingShiftObj.endTime)}
            </p>
            <ShiftEditForm
              shift={editingShiftObj}
              formData={editFormData}
              setFormData={setEditFormData}
              eventDates={eventDates}
              onCancel={handleCancelEdit}
              onSave={handleSaveEdit}
              formatDateLabel={formatDateLabel}
              formatPhone={formatPhone}
              restricted={!!roleInfo?.restricted}
              onApproveVolunteer={handleApproveExisting}
            />
          </div>
        </div>
      )}

      {deletingShift && (() => {
        const filled = deletingShift.volunteersRegistered?.length || 0;
        const regs = deletingShift.volunteersRegistered || [];

        return (
          <div className="role-view-modal-backdrop" onClick={closeDeleteDialog}>
            <div className="role-view-modal" onClick={(e) => e.stopPropagation()}>
              <h3>Delete this shift?</h3>
              <p>
                <strong>{formatDateLabel(deletingShift.date)}</strong> at{" "}
                {formatTime(deletingShift.startTime)}–{formatTime(deletingShift.endTime)}
              </p>

              {filled === 0 ? (
                <>
                  <p>No volunteers are signed up for this shift, so it's safe to delete.</p>
                  <div className="role-view-modal-actions">
                    <button onClick={closeDeleteDialog}>Cancel</button>
                    <button className="role-view-delete" onClick={handleConfirmDelete}>
                      Delete shift
                    </button>
                  </div>
                </>
              ) : deleteMode === null ? (
                <>
                  <div className="role-view-edit-warning danger">
                    ⚠️ <strong>Wait!</strong> {filled} volunteer{filled !== 1 ? "s are" : " is"} signed up for this shift. Decide what happens to them first.
                  </div>

                  <div className="role-view-contact-list">
                    <strong>Affected volunteers:</strong>
                    <ul>
                      {regs.map((v) => (
                        <VolunteerContactCard
                          key={v?._id || v?.id || v?.email}
                          volunteer={v}
                          formatPhone={formatPhone}
                        />
                      ))}
                    </ul>
                  </div>

                  <div className="role-view-modal-actions">
                    <button onClick={closeDeleteDialog}>Cancel</button>
                    <button onClick={() => setDeleteMode("remove")}>
                      Remove &amp; notify
                    </button>
                    <button
                      className="modern-primary-button"
                      onClick={() => setDeleteMode("move")}
                    >
                      Move to another shift
                    </button>
                  </div>
                </>
              ) : deleteMode === "move" ? (
                <>
                  <p>
                    {filled} volunteer{filled !== 1 ? "s" : ""} will move to the shift you pick below,
                    get a notice about the change, and this shift will be deleted.
                  </p>

                  <label>
                    Move them to:
                    <select
                      value={reassignTargetId}
                      onChange={(e) => setReassignTargetId(e.target.value)}
                      autoFocus
                    >
                      <option value="">Select a shift…</option>
                      {reassignTargetOptions.map((s) => {
                        const sFilled = s.volunteersRegistered?.length || 0;
                        const sNeeded = s.volunteersNeeded || 0;
                        return (
                          <option key={s._id} value={s._id}>
                            {formatDateLabel(s.date)} · {formatTime(s.startTime)}–{formatTime(s.endTime)} ({sFilled}/{sNeeded})
                          </option>
                        );
                      })}
                    </select>
                  </label>

                  <div className="role-view-modal-actions">
                    <button onClick={() => setDeleteMode(null)} disabled={deleteSubmitting}>
                      Back
                    </button>
                    <button
                      className="modern-primary-button"
                      onClick={handleConfirmMove}
                      disabled={!reassignTargetId || deleteSubmitting}
                    >
                      {deleteSubmitting ? "Moving…" : `Move ${filled} & delete this shift`}
                    </button>
                  </div>
                </>
              ) : (
                <>
                  <p>
                    Each of the {filled} volunteer{filled !== 1 ? "s" : ""} above will get a notice that this
                    shift was cancelled, then the shift will be deleted. There's no replacement shift for them to move to.
                  </p>

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
                    <button onClick={() => setDeleteMode(null)} disabled={deleteSubmitting}>
                      Back
                    </button>
                    <button
                      className="role-view-delete"
                      onClick={handleConfirmRemoveAndDelete}
                      disabled={deleteConfirmText !== "DELETE" || deleteSubmitting}
                    >
                      {deleteSubmitting ? "Removing…" : "Remove volunteers & delete shift"}
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
const COLLAPSED_VOLUNTEER_LIMIT = 4;

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
  onEdit,
  onDelete,
  onRemoveVolunteer,
  onApproveVolunteer,
  removingVolunteerId,
  formatTime,
  formatPhone,
  restricted,
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
          // "needed" is the shift's TOTAL target headcount, same field and
          // meaning the backend uses to gate signups. totalSlots used to be
          // filled + needed (double counting); it's just needed.
          const needed = shift.volunteersNeeded || 0;
          const totalSlots = needed;
          const remaining = Math.max(0, needed - filled);
          const statusClass = remaining === 0 ? "filled" : filled === 0 ? "critical" : "partial";

          const top = (start - HOUR_START) * HOUR_HEIGHT;
          const height = (end - start) * HOUR_HEIGHT;
          const widthPct = 100 / totalColumns;
          const leftPct = column * widthPct;

          const isExpanded = expandedShift === shift._id;

          const regs = shift.volunteersRegistered || [];
          const hasMoreVolunteers = regs.length > COLLAPSED_VOLUNTEER_LIMIT;
          const visibleRegs = isExpanded ? regs : regs.slice(0, COLLAPSED_VOLUNTEER_LIMIT);

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
                {shift.notes && (
                  <button
                    type="button"
                    className={`timeline-note-toggle ${isExpanded ? "active" : ""}`}
                    onClick={(e) => {
                      e.stopPropagation();
                      setExpandedShift(isExpanded ? null : shift._id);
                    }}
                    aria-expanded={isExpanded}
                    aria-label={isExpanded ? "Hide shift note" : "Show shift note"}
                    title={isExpanded ? "Hide note" : "Show note"}
                  >
                    <span className="timeline-note-toggle-caret" aria-hidden="true">{isExpanded ? "▾" : "▸"}</span> note
                  </button>
                )}
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
                {regs.length > 0 ? (
                  <>
                    <ul className="timeline-vol-list">
                      {visibleRegs.map((v) => {
                        const isUnapproved =
                          restricted &&
                          !(Array.isArray(v?.approvedRoles) && v.approvedRoles.includes(shift.role));
                        return (
                          <VolunteerContactCard
                            key={v?._id || v?.id || v?.email}
                            volunteer={v}
                            formatPhone={formatPhone}
                            onRemove={onRemoveVolunteer ? () => onRemoveVolunteer(shift, v) : null}
                            onApprove={
                              isUnapproved && onApproveVolunteer ? () => onApproveVolunteer(v) : null
                            }
                            removing={removingVolunteerId === v?._id}
                            unapproved={isUnapproved}
                          />
                        );
                      })}
                    </ul>
                    {hasMoreVolunteers && (
                      <button
                        type="button"
                        className="timeline-vol-more"
                        onClick={(e) => {
                          e.stopPropagation();
                          setExpandedShift(isExpanded ? null : shift._id);
                        }}
                        aria-expanded={isExpanded}
                      >
                        {isExpanded
                          ? "Show fewer"
                          : `+${regs.length - COLLAPSED_VOLUNTEER_LIMIT} more`}
                      </button>
                    )}
                  </>
                ) : (
                  <p className="timeline-no-vols">No volunteers signed up</p>
                )}

                {shift.notes && isExpanded && (
                  <p className="timeline-notes">📌 {shift.notes}</p>
                )}
              </div>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function ShiftEditForm({ shift, formData, setFormData, eventDates, onCancel, onSave, formatDateLabel, formatPhone, restricted, onApproveVolunteer }) {
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
              {shift.volunteersRegistered.map((v) => {
                const isUnapproved =
                  restricted &&
                  !(Array.isArray(v?.approvedRoles) && v.approvedRoles.includes(shift.role));
                return (
                  <VolunteerContactCard
                    key={v?._id || v?.id || v?.email}
                    volunteer={v}
                    formatPhone={formatPhone}
                    unapproved={isUnapproved}
                    onApprove={
                      isUnapproved && onApproveVolunteer ? () => onApproveVolunteer(v) : null
                    }
                  />
                );
              })}
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
          rows={4}
        />
      </label>
      <div className="role-view-edit-actions">
        <button onClick={onCancel}>Cancel</button>
        <button className="modern-primary-button" onClick={onSave}>Save</button>
      </div>
    </div>
  );
}

function VolunteerContactCard({ volunteer, formatPhone, onRemove, onApprove, removing, unapproved }) {
  const v = volunteer || {};
  const name = v.preferredName || v.name || v.email || "Volunteer";
  const phone = v.phone;
  const email = v.email;
  const phoneHref = phone ? `tel:${phone.replace(/\D/g, "")}` : null;
  const emailHref = email ? `mailto:${email}` : null;

  return (
    <li className={`volunteer-contact-card${unapproved ? " volunteer-contact-card-unapproved" : ""}`}>
      <div className="volunteer-contact-top">
        <div className="volunteer-contact-name">
          👤 {name}
          {unapproved && (
            <span
              className="volunteer-unapproved-tag"
              title="Signed up before this role required approval, or was never approved. They are NOT in approvedRoles for this role."
            >
              ⚠️ Unapproved
            </span>
          )}
        </div>
        <div className="volunteer-contact-top-actions">
          {onApprove && (
            <button
              type="button"
              className="volunteer-contact-approve"
              onClick={(e) => { e.stopPropagation(); onApprove(); }}
              disabled={removing}
              title="Approve this volunteer for this restricted role"
              aria-label="Approve for this role"
            >
              {removing ? "…" : "✓ Approve"}
            </button>
          )}
          {onRemove && (
            <button
              type="button"
              className="volunteer-contact-remove"
              onClick={(e) => { e.stopPropagation(); onRemove(); }}
              disabled={removing}
              title="Remove from this shift"
              aria-label="Remove from this shift"
            >
              {removing ? "…" : "✕"}
            </button>
          )}
        </div>
      </div>
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