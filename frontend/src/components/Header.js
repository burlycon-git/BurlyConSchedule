import React, { useCallback, useEffect, useState } from "react";
import { createPortal } from "react-dom";
import { Link } from "react-router-dom";
import "../styles/header.css";
import "../styles/volunteerNotices.css";
import { hasRole, getUserId } from "../utils/authUtils";

const API_BASE = process.env.REACT_APP_API_BASE;

export default function Header() {
  const [isMobileMenuOpen, setIsMobileMenuOpen] = useState(false);

  const clientId = process.env.REACT_APP_FUSIONAUTH_CLIENT_ID;
  const redirectUri = process.env.REACT_APP_FUSIONAUTH_REDIRECT_URI;
  const logoutRedirect = process.env.REACT_APP_LOGOUT_REDIRECT;
  const domain = process.env.REACT_APP_FUSIONAUTH_DOMAIN;

  const handleLogin = () => {
    const scope = encodeURIComponent("openid email profile phone");
    const authorizationUrl = `${domain}/oauth2/authorize?client_id=${clientId}&redirect_uri=${encodeURIComponent(
      redirectUri
    )}&response_type=code&scope=${scope}`;
    window.location.href = authorizationUrl;
  };

  const handleLogout = () => {
    // Clear local session
    localStorage.removeItem("access_token");
    localStorage.removeItem("user");

    // Redirect to logout URL
    const encodedPostLogout = encodeURIComponent(logoutRedirect);
    window.location.href = `${domain}/oauth2/logout?client_id=${clientId}&post_logout_redirect_uri=${encodedPostLogout}`;
  };

  const isLoggedIn = !!localStorage.getItem("access_token");
  const user = JSON.parse(localStorage.getItem("user") || "{}");
  const userId = getUserId(); // fusionAuthId, used for the two volunteer-facing features below

  // display name or email
  const displayName =
    user?.preferredName ||
    (user?.email ? user.email.split("@")[0] : "User");

  const initial = (displayName || "U").charAt(0).toUpperCase();

  // Role
  const roleLabel = hasRole("Admin") ? "Admin" : hasRole("Lead") ? "Lead" : "Volunteer";

  const selfServiceUrl = `${domain}/account/?client_id=${clientId}`;

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

  // ---------------------------------------------------------------------
  // Login acknowledgment modal: pops up whenever a logged-in volunteer has
  // any notification (shift removed/reassigned, role request decided) they
  // haven't acknowledged yet. Lives in Header because Header is mounted on
  // every page, so this effectively fires "on login" / "on next page load"
  // regardless of which page they land on.
  // ---------------------------------------------------------------------
  const [unacknowledged, setUnacknowledged] = useState([]);
  const [ackingId, setAckingId] = useState(null);

  const loadUnacknowledged = useCallback(() => {
    if (!userId) return;
    fetch(`${API_BASE}/api/volunteer/notifications/${userId}`)
      .then((res) => (res.ok ? res.json() : []))
      .then((data) => setUnacknowledged(Array.isArray(data) ? data : []))
      .catch((err) => console.error("Error loading notifications:", err));
  }, [userId]);

  useEffect(() => {
    loadUnacknowledged();
  }, [loadUnacknowledged]);

  const formatNoticeDate = (dateStr) => {
    if (!dateStr) return "";
    try {
      return new Date(dateStr).toLocaleString(undefined, {
        month: "short",
        day: "numeric",
        hour: "numeric",
        minute: "2-digit",
      });
    } catch {
      return "";
    }
  };

  const handleAcknowledge = async (notificationId) => {
    setAckingId(notificationId);
    try {
      const res = await fetch(
        `${API_BASE}/api/volunteer/notifications/${userId}/${notificationId}/acknowledge`,
        { method: "POST" }
      );
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setUnacknowledged((prev) => prev.filter((n) => n._id !== notificationId));
    } catch (err) {
      alert("Couldn't mark that as read -- please try again.");
    } finally {
      setAckingId(null);
    }
  };

  const handleAcknowledgeAll = async () => {
    setAckingId("all");
    try {
      await Promise.all(
        unacknowledged.map((n) =>
          fetch(`${API_BASE}/api/volunteer/notifications/${userId}/${n._id}/acknowledge`, {
            method: "POST",
          })
        )
      );
      setUnacknowledged([]);
    } catch (err) {
      alert("Couldn't mark everything as read -- please try again.");
    } finally {
      setAckingId(null);
    }
  };

  // ---------------------------------------------------------------------
  // Contact Coordinator button + modal: lets a logged-in volunteer send an
  // in-app message instead of calling/texting. Backend logs it as a
  // ContactMessage and alerts the coordinator by email.
  // ---------------------------------------------------------------------
  const [showContactModal, setShowContactModal] = useState(false);
  const [contactMessage, setContactMessage] = useState("");
  const [contactSubmitting, setContactSubmitting] = useState(false);
  const [contactSent, setContactSent] = useState(false);
  const [contactError, setContactError] = useState(null);

  const openContactModal = () => {
    setContactMessage("");
    setContactError(null);
    setContactSent(false);
    setShowContactModal(true);
    setIsMobileMenuOpen(false);
  };

  const closeContactModal = () => setShowContactModal(false);

  const handleSubmitContact = async () => {
    if (!contactMessage.trim()) return;
    setContactSubmitting(true);
    setContactError(null);
    try {
      const res = await fetch(`${API_BASE}/api/volunteer/contact-coordinator`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ userId, message: contactMessage.trim() }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      setContactSent(true);
      setContactMessage("");
    } catch (err) {
      setContactError("Couldn't send your message -- please try again in a bit.");
    } finally {
      setContactSubmitting(false);
    }
  };

  return (
    <header className="modern-header">
      <div className="modern-header-backdrop"></div>
      <div className="modern-header-inner">
        {/* Logo Section */}
        <div className="modern-logo">
          <a
            href="https://burlycon.org"
            className="modern-logo-link"
            target="_blank"
            rel="noopener noreferrer"
            title="Visit BurlyCon.org"
          >
            <img
              src="https://i0.wp.com/burlycon.org/wp-content/uploads/2025/12/bc-logo-pink.png?resize=300%2C56&ssl=1"
              alt="BurlyCon Logo"
              className="modern-logo-image"
            />
            <div className="modern-logo-text">
              <span className="modern-logo-title">BurlyCon</span>
              <span className="modern-logo-subtitle">Volunteer Portal</span>
            </div>
          </a>
        </div>

        {/* Desktop Navigation */}
        <nav className="modern-nav-desktop">
          <div className="modern-nav-links">
            <Link to="/" className="modern-nav-link">
              <span className="modern-nav-text">Home</span>
            </Link>

            <Link to="/volunteer" className="modern-nav-link">
              <span className="modern-nav-text">Volunteer</span>
            </Link>

            <Link to="/profile" className="modern-nav-link">
              <span className="modern-nav-text">My Profile</span>
            </Link>

            {(hasRole("Admin") || hasRole("Lead")) && (
              <Link to="/admin" className="modern-nav-link admin">
                <span className="modern-nav-text">Admin</span>
                <span className="modern-admin-badge">Admin</span>
              </Link>
            )}
          </div>

          {/* User Section */}
          <div className="modern-user-section">
            {isLoggedIn && (
              <button
                type="button"
                className="contact-coordinator-button"
                onClick={openContactModal}
                title="Send a message to your volunteer coordinator"
              >
                <span className="contact-coordinator-icon">💬</span>
                <span className="contact-coordinator-text">Contact Coordinator</span>
              </button>
            )}

            {isLoggedIn ? (
              <div className="modern-user-menu">
                <a
                  href={selfServiceUrl}
                  className="modern-user-info"
                  target="_blank"
                  rel="noopener noreferrer"
                  title="Manage your profile in FusionAuth"
                >
                  <div className="modern-user-avatar">{initial}</div>
                  <div className="modern-user-details">
                    <span className="modern-user-name">Hi, {displayName}</span>
                    <span className="modern-user-status">{roleLabel}</span>
                  </div>
                </a>

                <button
                  type="button"
                  className="modern-logout-button"
                  onClick={handleLogout}
                  title="Log Out"
                >
                  <span className="modern-logout-icon">🚪</span>
                  <span className="modern-logout-text">Log Out</span>
                </button>
              </div>
            ) : (
              <button
                type="button"
                className="modern-login-button"
                onClick={handleLogin}
              >
                <span className="modern-login-icon">🔐</span>
                <span className="modern-login-text">Log In</span>
              </button>
            )}
          </div>
        </nav>

        {/* Mobile Menu Button */}
        <button
          className="modern-mobile-menu-button"
          onClick={toggleMobileMenu}
          aria-label="Toggle mobile menu"
        >
          <span className={`modern-hamburger ${isMobileMenuOpen ? "open" : ""}`}>
            <span></span>
            <span></span>
            <span></span>
          </span>
        </button>
      </div>

      {/* Mobile Navigation */}
      <nav className={`modern-nav-mobile ${isMobileMenuOpen ? "open" : ""}`}>
        <div className="modern-mobile-nav-content">
          {isLoggedIn && (
            <a
              href={selfServiceUrl}
              className="modern-mobile-user-info"
              target="_blank"
              rel="noopener noreferrer"
              title="Manage your profile in FusionAuth"
            >
              <div className="modern-mobile-avatar">{initial}</div>
              <div className="modern-mobile-user-details">
                <span className="modern-mobile-user-name">Hi, {displayName}</span>
                <span className="modern-mobile-user-status">{roleLabel}</span>
              </div>
            </a>
          )}

          <div className="modern-mobile-nav-links">
            <Link
              to="/"
              className="modern-mobile-nav-link"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="modern-nav-text">Home</span>
            </Link>

            <Link
              to="/volunteer"
              className="modern-mobile-nav-link"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="modern-nav-text">Volunteer</span>
            </Link>

            <Link
              to="/profile"
              className="modern-mobile-nav-link"
              onClick={() => setIsMobileMenuOpen(false)}
            >
              <span className="modern-nav-text">My Profile</span>
            </Link>

            {(hasRole("Admin") || hasRole("Lead")) && (
              <Link
                to="/admin"
                className="modern-mobile-nav-link admin"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="modern-nav-text">Admin</span>
                <span className="modern-mobile-admin-badge">Admin</span>
              </Link>
            )}
          </div>

          {isLoggedIn && (
            <button
              type="button"
              className="modern-mobile-nav-link contact-coordinator-mobile"
              onClick={openContactModal}
            >
              <span className="contact-coordinator-icon">💬</span>
              <span className="modern-nav-text">Contact Coordinator</span>
            </button>
          )}

          <div className="modern-mobile-auth-section">
            {isLoggedIn ? (
              <button
                type="button"
                className="modern-mobile-logout-button"
                onClick={handleLogout}
              >
                <span className="modern-logout-icon">🚪</span>
                <span className="modern-logout-text">Log Out</span>
              </button>
            ) : (
              <button
                type="button"
                className="modern-mobile-login-button"
                onClick={handleLogin}
              >
                <span className="modern-login-icon">🔐</span>
                <span className="modern-login-text">Log In</span>
              </button>
            )}
          </div>
        </div>
      </nav>

      {/* Mobile Menu Overlay */}
      {isMobileMenuOpen && (
        <div
          className="modern-mobile-overlay"
          onClick={() => setIsMobileMenuOpen(false)}
        ></div>
      )}

      {/* Login acknowledgment modal -- pops up whenever there's anything
          unacknowledged. Shows on top of whichever page the volunteer landed
          on, since Header renders everywhere. Rendered via a portal straight
          into document.body: the header has a blur/backdrop effect, and any
          ancestor with a CSS filter/backdrop-filter/transform becomes the
          containing block for "position: fixed" descendants, which was
          clipping this modal to the header's own box instead of the full
          viewport. Portaling out of the header sidesteps that entirely. */}
      {unacknowledged.length > 0 && createPortal(
        <div className="volunteer-notice-backdrop">
          <div className="volunteer-notice-modal">
            <h3 className="volunteer-notice-title">
              📣 {unacknowledged.length === 1 ? "You have an update" : `You have ${unacknowledged.length} updates`}
            </h3>
            <p className="volunteer-notice-subtitle">
              Please review and acknowledge before continuing.
            </p>

            <div className="volunteer-notice-list">
              {unacknowledged.map((n) => (
                <div key={n._id} className="volunteer-notice-item">
                  <p className="volunteer-notice-message">{n.message}</p>
                  {n.createdAt && (
                    <span className="volunteer-notice-date">{formatNoticeDate(n.createdAt)}</span>
                  )}
                  <button
                    type="button"
                    className="volunteer-notice-ack-button"
                    onClick={() => handleAcknowledge(n._id)}
                    disabled={ackingId === n._id || ackingId === "all"}
                  >
                    {ackingId === n._id ? "…" : "Acknowledge"}
                  </button>
                </div>
              ))}
            </div>

            {unacknowledged.length > 1 && (
              <div className="volunteer-notice-actions">
                <button
                  type="button"
                  className="volunteer-notice-ack-all-button"
                  onClick={handleAcknowledgeAll}
                  disabled={ackingId !== null}
                >
                  {ackingId === "all" ? "Acknowledging…" : "Acknowledge all"}
                </button>
              </div>
            )}
          </div>
        </div>,
        document.body
      )}

      {/* Contact Coordinator modal -- also portaled, same reason as above. */}
      {showContactModal && createPortal(
        <div className="volunteer-notice-backdrop" onClick={closeContactModal}>
          <div className="volunteer-notice-modal" onClick={(e) => e.stopPropagation()}>
            {contactSent ? (
              <>
                <h3 className="volunteer-notice-title">✅ Message sent</h3>
                <p className="volunteer-notice-subtitle">
                  Your volunteer coordinator has been notified and will follow up with you.
                </p>
                <div className="volunteer-notice-actions">
                  <button className="volunteer-notice-primary-button" onClick={closeContactModal}>
                    Close
                  </button>
                </div>
              </>
            ) : (
              <>
                <h3 className="volunteer-notice-title">💬 Contact your coordinator</h3>
                <p className="volunteer-notice-subtitle">
                  Send a message directly -- no need to call. We'll get back to you as soon as we can.
                </p>

                <textarea
                  className="contact-coordinator-textarea"
                  rows={5}
                  placeholder="What's going on?"
                  value={contactMessage}
                  onChange={(e) => setContactMessage(e.target.value)}
                  autoFocus
                />

                {contactError && <p className="contact-coordinator-error">{contactError}</p>}

                <div className="volunteer-notice-actions">
                  <button type="button" onClick={closeContactModal} disabled={contactSubmitting}>
                    Cancel
                  </button>
                  <button
                    type="button"
                    className="volunteer-notice-primary-button"
                    onClick={handleSubmitContact}
                    disabled={!contactMessage.trim() || contactSubmitting}
                  >
                    {contactSubmitting ? "Sending…" : "Send message"}
                  </button>
                </div>
              </>
            )}
          </div>
        </div>,
        document.body
      )}
    </header>
  );
}