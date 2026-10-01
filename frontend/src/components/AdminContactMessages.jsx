import React, { useCallback, useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import Header from "./Header";
import { hasRole } from "../utils/authUtils";
import "../styles/adminContactMessages.css";

const API_BASE = process.env.REACT_APP_API_BASE;

export default function AdminContactMessages() {
  const navigate = useNavigate();

  // Gated on VolunteerCoordinator ONLY -- deliberately not Admin too. This
  // org hands out Admin broadly enough (Lead/Admin overlap too much to
  // bother distinguishing) that "or Admin" would mean "basically everyone,"
  // defeating the point of a VC-specific inbox. Mirrors the backend gate in
  // adminVolunteerRoutes.js (requireVolunteerCoordinator). Anyone without
  // the role, Admin included, gets bounced here before the API call that
  // would 403 anyway.
  const isVolunteerCoordinator = hasRole("VolunteerCoordinator");
  const canAccessPage = isVolunteerCoordinator;

  const [messages, setMessages] = useState([]);
  const [statusFilter, setStatusFilter] = useState("new");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [resolvingId, setResolvingId] = useState(null);

  const API = (p) => `${API_BASE || ""}${p}`;
  const authHeader = () => ({
    Authorization: `Bearer ${localStorage.getItem("access_token")}`,
  });

  useEffect(() => {
    if (!canAccessPage) {
      navigate("/");
    }
  }, [canAccessPage, navigate]);

  const refresh = useCallback(() => {
    setLoading(true);
    setError(null);
    const query = statusFilter === "all" ? "" : `?status=${statusFilter}`;
    fetch(API(`/api/admin/contact-messages${query}`), { headers: authHeader() })
      .then((res) => {
        if (!res.ok) throw new Error(`HTTP ${res.status}`);
        return res.json();
      })
      .then((data) => {
        setMessages(data);
        setLoading(false);
      })
      .catch((err) => {
        console.error("Error fetching contact messages:", err);
        setError("Couldn't load messages.");
        setLoading(false);
      });
  }, [statusFilter]);

  useEffect(() => {
    if (!canAccessPage) return;
    refresh();
  }, [canAccessPage, refresh]);

  const handleResolve = async (id) => {
    setResolvingId(id);
    try {
      const res = await fetch(API(`/api/admin/contact-messages/${id}/resolve`), {
        method: "PATCH",
        headers: authHeader(),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      if (statusFilter === "new") {
        // It no longer belongs in this filtered view.
        setMessages((prev) => prev.filter((m) => m._id !== id));
      } else {
        refresh();
      }
    } catch (err) {
      alert(`Failed to mark resolved: ${err.message}`);
    } finally {
      setResolvingId(null);
    }
  };

  const formatDateTime = (iso) => {
    if (!iso) return "";
    const d = new Date(iso);
    return d.toLocaleString(undefined, {
      month: "short",
      day: "numeric",
      hour: "numeric",
      minute: "2-digit",
    });
  };

  const formatShiftTime = (timeStr) => {
    if (!timeStr || !timeStr.includes(":")) return timeStr;
    const [hour, min] = timeStr.split(":").map(Number);
    const suffix = hour >= 12 ? "PM" : "AM";
    const displayHour = ((hour + 11) % 12) + 1;
    return `${displayHour}:${String(min).padStart(2, "0")} ${suffix}`;
  };

  if (!canAccessPage) return null;

  return (
    <div className="modern-page-container">
      <Header />

      <div className="modern-header-section">
        <div className="modern-header-content">
          <h1 className="modern-page-title">💬 Volunteer Messages</h1>
          <p className="modern-page-subtitle">
            Messages sent through the in-app Contact Coordinator button.
          </p>
        </div>
      </div>

      <div className="modern-content-wrapper">
        <div className="modern-filter-section">
          <div className="modern-filter-header">
            <h3 className="modern-filter-title">
              {messages.length} message{messages.length !== 1 ? "s" : ""}
            </h3>
            <div className="modern-filter-controls">
              <select
                value={statusFilter}
                onChange={(e) => setStatusFilter(e.target.value)}
                className="modern-sort-select"
              >
                <option value="new">Needs attention</option>
                <option value="resolved">Resolved</option>
                <option value="all">All</option>
              </select>
            </div>
          </div>
        </div>

        {loading ? (
          <div className="modern-loading-state">
            <div className="modern-loading-spinner" />
            <p>Loading messages…</p>
          </div>
        ) : error ? (
          <p className="modern-error">{error}</p>
        ) : messages.length === 0 ? (
          <div className="modern-empty-state">
            <div className="modern-empty-icon">✅</div>
            <h3 className="modern-empty-title">
              {statusFilter === "new" ? "Nothing needs attention" : "No messages"}
            </h3>
            <p className="modern-empty-description">
              {statusFilter === "new"
                ? "Every message sent through the Contact Coordinator button has been resolved."
                : "Nothing here yet."}
            </p>
          </div>
        ) : (
          <div className="contact-messages-list">
            {messages.map((msg) => {
              const volunteer = msg.fromUser || {};
              const shift = msg.relatedShift;
              return (
                <div
                  key={msg._id}
                  className={`contact-message-card ${msg.status === "resolved" ? "resolved" : ""}`}
                >
                  <div className="contact-message-header">
                    <div className="contact-message-from">
                      <span className="contact-message-name">
                        {volunteer.preferredName || volunteer.email || "Unknown volunteer"}
                      </span>
                      {volunteer.email && (
                        <a href={`mailto:${volunteer.email}`} className="contact-message-email">
                          {volunteer.email}
                        </a>
                      )}
                      {volunteer.phone && (
                        <a href={`tel:${volunteer.phone}`} className="contact-message-phone">
                          📞 {volunteer.phone}
                        </a>
                      )}
                    </div>
                    <span className="contact-message-time">{formatDateTime(msg.createdAt)}</span>
                  </div>

                  {shift && (
                    <div className="contact-message-shift-context">
                      📅 Re: {shift.role} — {shift.date} {formatShiftTime(shift.startTime)}–
                      {formatShiftTime(shift.endTime)}
                    </div>
                  )}

                  <p className="contact-message-text">{msg.message}</p>

                  <div className="contact-message-footer">
                    {msg.status === "resolved" ? (
                      <span className="contact-message-resolved-badge">
                        ✓ Resolved {formatDateTime(msg.resolvedAt)}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className="contact-message-resolve-button"
                        onClick={() => handleResolve(msg._id)}
                        disabled={resolvingId === msg._id}
                      >
                        {resolvingId === msg._id ? "Marking…" : "Mark resolved"}
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>
    </div>
  );
}