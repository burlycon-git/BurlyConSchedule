import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from "react";
import { Link } from "react-router-dom";
import Header from "./Header";
import { hasRole } from "../utils/authUtils";
import "../styles/adminDash.css";

export default function AdminDashboard() {
  const [needsByDate, setNeedsByDate] = useState({});
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [totalShifts, setTotalShifts] = useState(0);
  const [volunteerCount, setVolunteerCount] = useState(0);
  const [allShiftsData, setAllShiftsData] = useState([]);

  const [expandedDepts, setExpandedDepts] = useState({});
  const [filterView, setFilterView] = useState("all");

  const [activeEvent, setActiveEvent] = useState(null);
  const [dates, setDates] = useState([]);

  const isAdmin = hasRole("Admin");
  const API_BASE = process.env.REACT_APP_API_BASE;

  const mountedRef = useRef(true);
  useEffect(() => {
    mountedRef.current = true;
    return () => {
      mountedRef.current = false;
    };
  }, []);

  // Fetch active event and generate the dates array
  useEffect(() => {
    fetch(`${API_BASE}/api/events/active`)
      .then((res) => res.json())
      .then((event) => {
        setActiveEvent(event);
        const generated = [];
        const start = new Date(event.startDate);
        const end = new Date(event.endDate);
        for (
          let d = new Date(start);
          d <= end;
          d.setUTCDate(d.getUTCDate() + 1)
        ) {
          generated.push(d.toISOString().split("T")[0]);
        }
        setDates(generated);
      })
      .catch((err) => {
        console.error("Failed to load active event:", err);
        setError("Failed to load active event");
      });
  }, [API_BASE]);

  const loadData = useCallback(
    async (opts) => {
      setLoading(true);
      setError(null);

      try {
        if (!API_BASE) {
          setError("API base URL not configured.");
          setLoading(false);
          return;
        }

        const requests = dates.map((date) =>
          fetch(`${API_BASE}/api/volunteer/${date}`, {
            ...(opts?.signal ? { signal: opts.signal } : {}),
            credentials: "include",
            cache: "no-store",
          }).then(async (r) => {
            if (!r.ok)
              throw new Error(`GET /api/volunteer/${date} -> ${r.status}`);
            const json = await r.json();
            return { date, json };
          }),
        );

        const results = await Promise.allSettled(requests);

        const allNeeds = {};
        let total = 0;
        const volunteers = new Set();
        const allShifts = [];

        results.forEach((res) => {
          if (res.status === "fulfilled") {
            const { date, json } = res.value;
            // NOTE: volunteersNeeded is the TOTAL headcount target for a
            // shift (same semantics the backend's signUpForFlexShift uses
            // to decide "Shift full", and what ShiftForm's "Volunteers
            // Needed" field means when a shift is created). A shift that's
            // already fully staffed still has volunteersNeeded > 0 -- it
            // just also has volunteersRegistered.length >= volunteersNeeded.
            // So "does this shift still need help" is volunteersNeeded >
            // registered.length, not just volunteersNeeded > 0. The old
            // version of this filter used the latter, which meant a shift
            // sitting at exactly 3/3 kept showing up here as still needing
            // 3 more volunteers.
            const filtered = json.filter(
              (n) =>
                (n.volunteersNeeded || 0) >
                (n.volunteersRegistered?.length || 0),
            );
            if (filtered.length) allNeeds[date] = filtered;
            total += json.length;

            json.forEach((shift) => {
              allShifts.push({ ...shift, date });
              if (shift.volunteersRegistered) {
                shift.volunteersRegistered.forEach((v) => {
                  const id = v?._id ?? v?.id ?? v;
                  volunteers.add(id);
                });
              }
            });
          } else {
            // Ignore AbortErrors (happens on remount/refresh), only set error for real failures
            if (res.reason?.name !== "AbortError") {
              console.warn(res.reason);
              setError("Some data failed to load. Retrying on focus.");
            }
          }
        });

        if (!mountedRef.current) return;

        setNeedsByDate(allNeeds);
        setTotalShifts(total);
        setVolunteerCount(volunteers.size);
        setAllShiftsData(allShifts);
      } catch (e) {
        if (opts?.signal?.aborted) return;
        console.error(e);
        if (mountedRef.current) setError(e?.message || "Failed to load data.");
      } finally {
        if (mountedRef.current) setLoading(false);
      }
    },
    [API_BASE, dates],
  );

  useEffect(() => {
    if (dates.length === 0) return;
    const c = new AbortController();
    loadData({ signal: c.signal });
    return () => c.abort();
  }, [loadData, dates]);

  useEffect(() => {
    const onFocus = () => {
      if (dates.length > 0) loadData();
    };
    const onVis = () => {
      if (!document.hidden && dates.length > 0) loadData();
    };
    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);
    return () => {
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [loadData, dates]);

  const departmentStats = useMemo(() => {
    const deptMap = {};

    allShiftsData.forEach((shift) => {
      const deptName = shift.role || "Unassigned";

      if (!deptMap[deptName]) {
        deptMap[deptName] = {
          name: deptName,
          shifts: [],
          totalCapacity: 0,
          totalFilled: 0,
          totalUnfilled: 0,
          criticalShifts: 0,
        };
      }

      const registered = shift.volunteersRegistered?.length || 0;
      // "needed" here is the shift's TOTAL target headcount (matches the
      // backend and ShiftForm's definition of volunteersNeeded), NOT "how
      // many more on top of who's already signed up." Capacity is just
      // that total -- it was previously computed as filled + needed, which
      // double-counted the people already registered and made every
      // shift's denominator look bigger (and its "still open" count look
      // bigger) than it actually is.
      const needed = shift.volunteersNeeded || 0;
      const capacity = needed;
      const filled = registered;
      const remaining = Math.max(0, needed - filled);

      deptMap[deptName].shifts.push({
        ...shift,
        filled,
        needed,
        remaining,
        capacity,
      });

      deptMap[deptName].totalCapacity += capacity;
      deptMap[deptName].totalFilled += filled;
      deptMap[deptName].totalUnfilled += remaining;

      if (needed > 0 && registered === 0) {
        deptMap[deptName].criticalShifts++;
      }
    });

    return Object.values(deptMap).sort(
      (a, b) => b.totalUnfilled - a.totalUnfilled,
    );
  }, [allShiftsData]);

  const totalUnfilled = useMemo(
    () => departmentStats.reduce((sum, dept) => sum + dept.totalUnfilled, 0),
    [departmentStats],
  );

  const totalFilled = useMemo(
    () => departmentStats.reduce((sum, dept) => sum + dept.totalFilled, 0),
    [departmentStats],
  );

  const totalCapacity = useMemo(
    () => departmentStats.reduce((sum, dept) => sum + dept.totalCapacity, 0),
    [departmentStats],
  );

  const criticalGaps = useMemo(
    () => departmentStats.reduce((sum, dept) => sum + dept.criticalShifts, 0),
    [departmentStats],
  );

  const coveragePercentage =
    totalCapacity > 0 ? Math.round((totalFilled / totalCapacity) * 100) : 0;

  const formatDateLabel = (date) => {
    const [year, month, day] = date.split("-").map(Number);
    const localDate = new Date(year, month - 1, day);
    return localDate.toLocaleDateString(undefined, {
      weekday: "short",
      month: "short",
      day: "numeric",
    });
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

  const toggleDepartment = (deptName) => {
    setExpandedDepts((prev) => ({
      ...prev,
      [deptName]: !prev[deptName],
    }));
  };

  const filteredDepartments = useMemo(() => {
    if (filterView === "critical") {
      return departmentStats.filter((d) => d.criticalShifts > 0);
    }
    if (filterView === "unfilled") {
      return departmentStats.filter((d) => d.totalUnfilled > 0);
    }
    return departmentStats;
  }, [departmentStats, filterView]);

  const scrollToDepartments = () => {
    const element = document.getElementById("department-breakdown");
    if (element) {
      element.scrollIntoView({ behavior: "smooth", block: "start" });
    }
  };

  return (
    <div className="modern-page-container">
      <Header />

      <div className="modern-header-section">
        <div className="modern-header-content">
          <h1 className="modern-page-title">Admin Dashboard</h1>
          {isAdmin && (
            <p className="modern-page-subtitle">
              Get a pulse on volunteer coverage and shift activity. Here's
              what's live and what needs attention.
            </p>
          )}
        </div>
      </div>

      <div className="modern-content-wrapper">
        {isAdmin && (
          <>
            <div className="modern-summary-dashboard">
              <button
                className="modern-summary-card gradient-purple clickable"
                onClick={() => {
                  setFilterView("all");
                  scrollToDepartments();
                }}
                style={{
                  cursor: "pointer",
                  border: "none",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div className="modern-summary-icon">📊</div>
                <div className="modern-summary-content">
                  <h3 className="modern-summary-title">Coverage</h3>
                  <p className="modern-summary-number">{coveragePercentage}%</p>
                  <p className="modern-summary-subtitle">
                    {totalFilled} of {totalCapacity} spots filled
                  </p>
                </div>
              </button>

              <button
                className="modern-summary-card gradient-blue clickable"
                onClick={() => {
                  setFilterView("unfilled");
                  scrollToDepartments();
                }}
                style={{
                  cursor: "pointer",
                  border: "none",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div className="modern-summary-icon">📋</div>
                <div className="modern-summary-content">
                  <h3 className="modern-summary-title">Unfilled Shifts</h3>
                  <p className="modern-summary-number">{totalUnfilled}</p>
                  <p className="modern-summary-subtitle">
                    Across all departments
                  </p>
                </div>
              </button>

              <button
                className="modern-summary-card gradient-green clickable"
                onClick={() => {
                  setFilterView("critical");
                  scrollToDepartments();
                }}
                style={{
                  cursor: "pointer",
                  border: "none",
                  textAlign: "left",
                  width: "100%",
                }}
              >
                <div className="modern-summary-icon">🚨</div>
                <div className="modern-summary-content">
                  <h3 className="modern-summary-title">Critical Gaps</h3>
                  <p className="modern-summary-number">{criticalGaps}</p>
                  <p className="modern-summary-subtitle">
                    Shifts with 0 volunteers
                  </p>
                </div>
              </button>
            </div>

            <div className="modern-admin-navigation">
              <h2 className="modern-section-title">Quick Actions</h2>
              <div className="modern-admin-links">
                <Link to="/admin/shifts" className="modern-nav-link shifts">
                  <div className="modern-nav-icon">📅</div>
                  <div className="modern-nav-content">
                    <h3 className="modern-nav-title">Manage Shifts</h3>
                    <p className="modern-nav-description">
                      Create and edit volunteer shifts
                    </p>
                  </div>
                  <div className="modern-nav-arrow">→</div>
                </Link>

                <Link to="/admin/roles" className="modern-nav-link roles">
                  <div className="modern-nav-icon">🛠️</div>
                  <div className="modern-nav-content">
                    <h3 className="modern-nav-title">Manage Volunteer Roles</h3>
                    <p className="modern-nav-description">
                      Define volunteer positions and requirements
                    </p>
                  </div>
                  <div className="modern-nav-arrow">→</div>
                </Link>

                <Link
                  to="/admin/volunteers"
                  className="modern-nav-link volunteers"
                >
                  <div className="modern-nav-icon">👥</div>
                  <div className="modern-nav-content">
                    <h3 className="modern-nav-title">View Volunteers</h3>
                    <p className="modern-nav-description">
                      See registered volunteers and assignments
                    </p>
                  </div>
                  <div className="modern-nav-arrow">→</div>
                </Link>
                <Link to="/admin/events" className="modern-nav-link events">
                  <div className="modern-nav-icon">📆</div>
                  <div className="modern-nav-content">
                    <h3 className="modern-nav-title">Manage Events</h3>
                    <p className="modern-nav-description">
                      Create new years and clone shifts
                    </p>
                  </div>
                  <div className="modern-nav-arrow">→</div>
                </Link>
              </div>
            </div>

            <div className="modern-alert-section" id="department-breakdown">
              <div className="modern-alert-card">
                <div className="modern-alert-header">
                  <h3 className="modern-alert-title">Department Breakdown</h3>
                  {filterView !== "all" && (
                    <button
                      onClick={() => setFilterView("all")}
                      className="modern-filter-badge"
                      style={{ cursor: "pointer" }}
                    >
                      {filterView === "critical"
                        ? "Showing Critical Only"
                        : "Showing Unfilled Only"}{" "}
                      - Clear Filter
                    </button>
                  )}
                </div>

                <div className="modern-alert-content">
                  {loading ? (
                    <div className="modern-loading-state">
                      <div className="modern-loading-spinner" />
                      <p>Loading shift data…</p>
                    </div>
                  ) : error ? (
                    <div className="modern-error-state">
                      <h4 className="modern-error-title">
                        Couldn't load everything
                      </h4>
                      <p className="modern-error-description">{error}</p>
                    </div>
                  ) : filteredDepartments.length === 0 ? (
                    <div className="modern-success-state">
                      <div className="modern-success-icon">✅</div>
                      <h4 className="modern-success-title">
                        {filterView === "critical"
                          ? "No critical gaps!"
                          : "All shifts are filled!"}
                      </h4>
                      <p className="modern-success-description">
                        {filterView === "critical"
                          ? "Great job! No shifts are completely empty."
                          : "All volunteer positions are currently covered."}
                      </p>
                    </div>
                  ) : (
                    <div className="modern-department-grid">
                      {filteredDepartments.map((dept) => {
                        const isExpanded = expandedDepts[dept.name];
                        const percentage =
                          dept.totalCapacity > 0
                            ? Math.round(
                                (dept.totalFilled / dept.totalCapacity) * 100,
                              )
                            : 0;
                        const percentageStr = percentage + "%";

                        return (
                          <div
                            key={dept.name}
                            className="modern-department-card"
                          >
                            <button
                              onClick={() => toggleDepartment(dept.name)}
                              className="modern-department-header"
                              style={{
                                cursor: "pointer",
                                border: "none",
                                textAlign: "left",
                                width: "100%",
                                background: "transparent",
                              }}
                            >
                              <div className="modern-department-title-row">
                                <div className="modern-department-name">
                                  <span className="modern-expand-icon">
                                    {isExpanded ? "▼" : "▶"}
                                  </span>
                                  <span>{dept.name}</span>
                                  {dept.criticalShifts > 0 && (
                                    <span className="modern-critical-badge">
                                      {dept.criticalShifts} critical
                                    </span>
                                  )}
                                </div>
                                <div className="modern-department-stats">
                                  <span
                                    className={
                                      dept.totalUnfilled === 0
                                        ? "modern-status-badge filled"
                                        : dept.totalUnfilled <= 3
                                          ? "modern-status-badge minor"
                                          : "modern-status-badge critical"
                                    }
                                  >
                                    {dept.totalUnfilled} open
                                  </span>
                                </div>
                              </div>

                              <div className="modern-department-progress">
                                <div className="modern-progress-bar">
                                  <div
                                    className="modern-progress-fill"
                                    style={{ width: percentageStr }}
                                  />
                                </div>
                                <span className="modern-progress-text">
                                  {dept.totalFilled} of {dept.totalCapacity}{" "}
                                  spots filled
                                </span>
                              </div>
                            </button>

                            {isExpanded && (
                              <div className="modern-department-details">
                                <h4 className="modern-details-title">
                                  All Shifts
                                </h4>
                                {dept.shifts
                                  .slice()
                                  .sort((a, b) => {
                                    const dateCompare = a.date.localeCompare(
                                      b.date,
                                    );
                                    if (dateCompare !== 0) return dateCompare;
                                    return b.remaining - a.remaining;
                                  })
                                  .map((shift, idx) => {
                                    const shiftPercentage =
                                      shift.capacity > 0
                                        ? Math.round(
                                            (shift.filled / shift.capacity) *
                                              100,
                                          )
                                        : 0;
                                    const shiftPercentageStr =
                                      shiftPercentage + "%";
                                    const isUnfilled = shift.remaining > 0;
                                    const hasVolunteers = !!(
                                      shift.volunteersRegistered &&
                                      shift.volunteersRegistered.length > 0
                                    );

                                    let badgeClass = "modern-shift-badge ";
                                    if (shift.filled === 0) {
                                      badgeClass += "critical";
                                    } else if (shift.remaining <= 2) {
                                      badgeClass += "minor";
                                    } else {
                                      badgeClass += "warning";
                                    }

                                    return (
                                      <div
                                        key={idx}
                                        className="modern-shift-detail"
                                      >
                                        <div className="modern-shift-info">
                                          <div className="modern-shift-label">
                                            <strong>
                                              {formatDateLabel(shift.date)}
                                            </strong>
                                            <span>
                                              {" "}
                                              • {formatTime(
                                                shift.startTime,
                                              )} – {formatTime(shift.endTime)}
                                            </span>
                                          </div>
                                          {isUnfilled && (
                                            <span className={badgeClass}>
                                              {shift.remaining} needed
                                            </span>
                                          )}
                                        </div>

                                        <div className="modern-shift-progress">
                                          <div className="modern-progress-bar small">
                                            <div
                                              className="modern-progress-fill"
                                              style={{
                                                width: shiftPercentageStr,
                                              }}
                                            />
                                          </div>
                                          <span className="modern-progress-text small">
                                            {shift.filled}/{shift.capacity}
                                          </span>
                                        </div>

                                        {hasVolunteers && (
                                          <div className="modern-volunteer-chips">
                                            {shift.volunteersRegistered.map(
                                              (vol) => {
                                                const id =
                                                  vol?._id ??
                                                  vol?.id ??
                                                  String(vol);
                                                const name =
                                                  vol?.preferredName ??
                                                  vol?.name ??
                                                  String(vol);
                                                return (
                                                  <Link
                                                    key={id}
                                                    to="/admin/volunteers"
                                                    className="modern-volunteer-chip"
                                                    title={name}
                                                  >
                                                    {name}
                                                  </Link>
                                                );
                                              },
                                            )}
                                          </div>
                                        )}
                                      </div>
                                    );
                                  })}
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

            <div className="modern-alert-section">
              <div className="modern-alert-card">
                <div className="modern-alert-header">
                  <h3 className="modern-alert-title">Gaps by Date</h3>
                  {totalUnfilled > 0 && (
                    <div className="modern-alert-badge">
                      {totalUnfilled} positions needed
                    </div>
                  )}
                </div>

                <div className="modern-alert-content">
                  {Object.keys(needsByDate).length === 0 ? (
                    <div className="modern-success-state">
                      <div className="modern-success-icon">✅</div>
                      <h4 className="modern-success-title">
                        All shifts are filled!
                      </h4>
                      <p className="modern-success-description">
                        Great job! All volunteer positions are currently
                        covered.
                      </p>
                    </div>
                  ) : (
                    <div className="modern-gaps-grid">
                      {Object.entries(needsByDate).map(([date, needs]) => {
                        // needs here has already been pre-filtered (above,
                        // in loadData) to shifts where volunteersNeeded >
                        // registered.length, so "remaining" below is always
                        // positive for everything rendered in this card.
                        const withRemaining = Array.isArray(needs)
                          ? needs.map((n) => ({
                              ...n,
                              remaining: Math.max(
                                0,
                                (n.volunteersNeeded || 0) -
                                  (n.volunteersRegistered?.length || 0),
                              ),
                            }))
                          : [];

                        const totalNeeded = withRemaining.reduce(
                          (sum, n) => sum + n.remaining,
                          0,
                        );

                        return (
                          <div key={date} className="modern-gap-card">
                            <div className="modern-gap-header">
                              <h4 className="modern-gap-date">
                                {formatDateLabel(date)}
                              </h4>
                              <div className="modern-gap-count">
                                {totalNeeded} needed
                              </div>
                            </div>

                            <div className="modern-gap-shifts">
                              {withRemaining
                                .slice()
                                .sort((a, b) => b.remaining - a.remaining)
                                .map((n) => {
                                  const needed = n.remaining;
                                  const isCritical = needed >= 2;
                                  const pillClass = isCritical
                                    ? "modern-shift-pill critical"
                                    : "modern-shift-pill minor";
                                  const icon = isCritical ? "🚨" : "📉";

                                  return (
                                    <div
                                      key={n._id}
                                      className="modern-shift-item"
                                    >
                                      <a
                                        href="https://www.burlyconvolunteers.com/admin/shifts"
                                        className={pillClass}
                                      >
                                        <span className="modern-shift-icon">
                                          {icon}
                                        </span>
                                        <div
                                          style={{
                                            flex: 1,
                                            display: "flex",
                                            flexDirection: "column",
                                            gap: "0.25rem",
                                          }}
                                        >
                                          <span className="modern-shift-time">
                                            {formatTime(n.startTime)}–
                                            {formatTime(n.endTime)}
                                          </span>
                                          <span
                                            style={{
                                              fontSize: "0.75rem",
                                              color: "#f9a8d4",
                                              fontWeight: 500,
                                            }}
                                          >
                                            {n.role || "Role not specified"}
                                          </span>
                                        </div>
                                        <span className="modern-shift-count">
                                          ({needed})
                                        </span>
                                      </a>
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
          </>
        )}
      </div>
    </div>
  );
}