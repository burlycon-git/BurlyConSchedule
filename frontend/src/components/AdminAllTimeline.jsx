import React, { useCallback, useEffect, useRef, useState } from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import { hasRole } from "../utils/authUtils";
import "../styles/adminAllTimeline.css";

const API_BASE = process.env.REACT_APP_API_BASE;
const HOUR_START = 7;
const HOUR_END = 26;
const HOUR_HEIGHT = 60;
const OPS_CHIP_LIMIT = 2;

function timeToHours(timeStr, isEndTime = false, startHours = null) {
  if (!timeStr) return 0;
  const [h, m] = timeStr.split(":").map(Number);
  let hours = h + (m || 0) / 60;
  if (isEndTime && startHours !== null && hours < startHours) {
    hours += 24;
  }
  return hours;
}

export default function AdminAllTimeline() {
  const [allShifts, setAllShifts] = useState([]);
  const [eventDates, setEventDates] = useState([]);
  const [selectedDate, setSelectedDate] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [expandedShift, setExpandedShift] = useState(null);
  const [scrollEdges, setScrollEdges] = useState({ left: false, right: false });

  const scrollRef = useRef(null);

  const isAdminOrLead = hasRole("Admin") || hasRole("Lead");

  const loadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [eventRes, shiftsRes] = await Promise.all([
        fetch(`${API_BASE}/api/events/active`),
        fetch(`${API_BASE}/api/volunteer`),
      ]);

      if (!eventRes.ok) throw new Error("Failed to load event");
      const event = await eventRes.json();

      const dates = [];
      const start = new Date(event.startDate);
      const end = new Date(event.endDate);
      for (let d = new Date(start); d <= end; d.setUTCDate(d.getUTCDate() + 1)) {
        dates.push(d.toISOString().split("T")[0]);
      }
      setEventDates(dates);
      if (!selectedDate && dates.length > 0) setSelectedDate(dates[0]);

      if (shiftsRes.ok) {
        const data = await shiftsRes.json();
        setAllShifts(data);
      }
    } catch (e) {
      setError(e.message || "Failed to load");
    } finally {
      setLoading(false);
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

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

  const updateScrollEdges = useCallback(() => {
    const el = scrollRef.current;
    if (!el) return;
    const { scrollLeft, scrollWidth, clientWidth } = el;
    setScrollEdges({
      left: scrollLeft > 4,
      right: scrollLeft + clientWidth < scrollWidth - 4,
    });
  }, []);

  // Filter to selected day
  const dayShifts = allShifts.filter((s) => s.date === selectedDate);

  // Group by role
  const byRole = dayShifts.reduce((acc, shift) => {
    if (!acc[shift.role]) acc[shift.role] = [];
    acc[shift.role].push(shift);
    return acc;
  }, {});

  const sortedRoles = Object.keys(byRole).sort();

  useEffect(() => {
    updateScrollEdges();
    window.addEventListener("resize", updateScrollEdges);
    return () => window.removeEventListener("resize", updateScrollEdges);
  }, [updateScrollEdges, loading, selectedDate, sortedRoles.length]);

  const hourLabels = [];
  for (let h = HOUR_START; h <= HOUR_END; h++) {
    const displayHour = h % 24;
    const suffix = displayHour >= 12 ? "PM" : "AM";
    const display = ((displayHour + 11) % 12) + 1;
    hourLabels.push({ hour: h, label: `${display} ${suffix}` });
  }

  const totalHeight = (HOUR_END - HOUR_START) * HOUR_HEIGHT;

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
    <div className="modern-page-container all-timeline-page">
      <Header />

      <div className="modern-header-section all-timeline-no-print">
        <div className="modern-header-content">
          <Link to="/admin" className="role-view-back">← Back to departments</Link>
          <h1 className="modern-page-title">Full Schedule (Ops View)</h1>
          <p className="modern-page-subtitle">
            Every department, every shift, by hour. Use this to find a volunteer or see what's happening when.
          </p>
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
            {/* Day tabs + print button */}
            <div className="all-timeline-toolbar all-timeline-no-print">
              <div className="role-view-day-tabs">
                {eventDates.map((d) => (
                  <button
                    key={d}
                    className={`role-view-day-tab ${selectedDate === d ? "active" : ""}`}
                    onClick={() => setSelectedDate(d)}
                  >
                    <span>{formatDateLabel(d)}</span>
                  </button>
                ))}
              </div>
              <button className="all-timeline-print-button" onClick={() => window.print()}>
                🖨️ Print
              </button>
            </div>

            {/* Print header — only visible when printing */}
            <div className="all-timeline-print-header">
              <h1>BurlyCon — Volunteer Schedule</h1>
              <h2>{selectedDate && formatDateLabel(selectedDate)}</h2>
            </div>

            {sortedRoles.length === 0 ? (
              <p className="role-view-empty">No shifts scheduled for this day.</p>
            ) : (
              <div className="all-timeline-scroll-wrap">
                {scrollEdges.left && (
                  <div className="all-timeline-fade left all-timeline-no-print" aria-hidden="true" />
                )}
                {scrollEdges.right && (
                  <div className="all-timeline-fade right all-timeline-no-print" aria-hidden="true" />
                )}

                <div
                  className="all-timeline-scroll"
                  ref={scrollRef}
                  onScroll={updateScrollEdges}
                >
                  <div
                    className="all-timeline"
                    style={{
                      gridTemplateColumns: `60px repeat(${sortedRoles.length}, minmax(180px, 1fr))`,
                    }}
                  >
                    {/* Top-left empty cell */}
                    <div className="all-timeline-corner" />

                    {/* Role headers */}
                    {sortedRoles.map((role) => (
                      <div key={role} className="all-timeline-role-header">
                        {role}
                      </div>
                    ))}

                    {/* Hour labels column */}
                    <div className="all-timeline-hours" style={{ height: `${totalHeight}px` }}>
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

                    {/* Per-role columns */}
                    {sortedRoles.map((role) => {
                      const roleShifts = byRole[role];
                      const positioned = roleShifts
                        .map((s) => {
                          const start = timeToHours(s.startTime);
                          const end = timeToHours(s.endTime, true, start);
                          return { shift: s, start, end };
                        })
                        .sort((a, b) => a.start - b.start);

                      // Sub-column placement for overlaps within this role
                      const subColumns = [];
                      positioned.forEach((p) => {
                        let placed = false;
                        for (let i = 0; i < subColumns.length; i++) {
                          const last = subColumns[i][subColumns[i].length - 1];
                          if (last.end <= p.start) {
                            subColumns[i].push(p);
                            p.subCol = i;
                            placed = true;
                            break;
                          }
                        }
                        if (!placed) {
                          p.subCol = subColumns.length;
                          subColumns.push([p]);
                        }
                      });

                      const totalSubs = Math.max(1, subColumns.length);

                      return (
                        <div
                          key={role}
                          className="all-timeline-col"
                          style={{ height: `${totalHeight}px` }}
                        >
                          {hourLabels.map((hl) => (
                            <div
                              key={hl.hour}
                              className="timeline-gridline"
                              style={{ top: `${(hl.hour - HOUR_START) * HOUR_HEIGHT}px` }}
                            />
                          ))}

                          {positioned.map(({ shift, start, end, subCol }) => {
                            const filled = shift.volunteersRegistered?.length || 0;
                            const needed = shift.volunteersNeeded || 0;
                            const totalSlots = filled + needed;
                            const statusClass = needed === 0
                              ? "filled"
                              : filled === 0
                                ? "critical"
                                : "partial";

                            const top = (start - HOUR_START) * HOUR_HEIGHT;
                            const height = (end - start) * HOUR_HEIGHT;
                            const widthPct = 100 / totalSubs;
                            const leftPct = subCol * widthPct;

                            const isExpanded = expandedShift === shift._id;

                            const regs = shift.volunteersRegistered || [];
                            const visibleRegs = isExpanded ? regs : regs.slice(0, OPS_CHIP_LIMIT);
                            const hiddenCount = regs.length - visibleRegs.length;

                            return (
                              <div
                                key={shift._id}
                                className={`all-timeline-shift ${statusClass} ${isExpanded ? "expanded" : ""}`}
                                style={{
                                  top: `${top}px`,
                                  height: `${height}px`,
                                  left: `${leftPct}%`,
                                  width: `calc(${widthPct}% - 4px)`,
                                  zIndex: isExpanded ? 5 : 1,
                                }}
                                onClick={() => setExpandedShift(isExpanded ? null : shift._id)}
                              >
                                <div className="all-timeline-shift-header">
                                  <span className="all-timeline-shift-time">
                                    {formatTime(shift.startTime)}–{formatTime(shift.endTime)}
                                  </span>
                                  <span className="all-timeline-shift-count">{filled}/{totalSlots}</span>
                                </div>

                                {regs.length > 0 ? (
                                  <ul className="all-timeline-vol-list">
                                    {visibleRegs.map((v) => {
                                      const name = v?.preferredName || v?.email || "Volunteer";
                                      return (
                                        <li key={v?._id || v?.id || name} className="all-timeline-vol-chip">
                                          {name}
                                        </li>
                                      );
                                    })}
                                    {hiddenCount > 0 && (
                                      <li className="all-timeline-vol-chip more">+{hiddenCount}</li>
                                    )}
                                  </ul>
                                ) : (
                                  <p className="all-timeline-no-vols">No volunteers</p>
                                )}

                                {isExpanded && shift.notes && (
                                  <p className="all-timeline-notes">📌 {shift.notes}</p>
                                )}
                              </div>
                            );
                          })}
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}