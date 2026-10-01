import React, { useState } from "react";
import { Link } from "react-router-dom";
import "../styles/header.css";
import { hasRole } from "../utils/authUtils";

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

  // display name or email
  const displayName =
    user?.preferredName ||
    (user?.email ? user.email.split("@")[0] : "User");

  const initial = (displayName || "U").charAt(0).toUpperCase();

  // Role
  const isAdmin = hasRole("Admin");
  const isLead = hasRole("Lead");
  const isVolunteerCoordinator = hasRole("VolunteerCoordinator");
  const roleLabel = isAdmin
    ? "Admin"
    : isVolunteerCoordinator
      ? "Volunteer Coordinator"
      : isLead
        ? "Lead"
        : "Volunteer";

  // VolunteerCoordinator ONLY -- see AdminContactMessages.jsx for why Admin
  // isn't included here too.
  const canSeeMessages = isVolunteerCoordinator;

  const selfServiceUrl = `${domain}/account/?client_id=${clientId}`;

  const toggleMobileMenu = () => setIsMobileMenuOpen(!isMobileMenuOpen);

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

            {(isAdmin || isLead) && (
              <Link to="/admin" className="modern-nav-link admin">
                <span className="modern-nav-text">Admin</span>
                <span className="modern-admin-badge">Admin</span>
              </Link>
            )}

            {canSeeMessages && (
              <Link to="/vc" className="modern-nav-link admin">
                <span className="modern-nav-text">Coordinator</span>
                <span className="modern-admin-badge">VC</span>
              </Link>
            )}
          </div>

          {/* User Section */}
          <div className="modern-user-section">
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

            {(isAdmin || isLead) && (
              <Link
                to="/admin"
                className="modern-mobile-nav-link admin"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="modern-nav-text">Admin</span>
                <span className="modern-mobile-admin-badge">Admin</span>
              </Link>
            )}

            {canSeeMessages && (
              <Link
                to="/vc"
                className="modern-mobile-nav-link admin"
                onClick={() => setIsMobileMenuOpen(false)}
              >
                <span className="modern-nav-text">Coordinator</span>
                <span className="modern-mobile-admin-badge">VC</span>
              </Link>
            )}
          </div>

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
    </header>
  );
}