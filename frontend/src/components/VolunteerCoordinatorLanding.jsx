import React from "react";
import { Link, useNavigate } from "react-router-dom";
import { useEffect } from "react";
import Header from "./Header";
import { hasRole } from "../utils/authUtils";
import "../styles/volunteerCoordinatorLanding.css";

// Landing page for the VolunteerCoordinator role, mirroring the pattern
// AdminLanding.jsx already uses for Admin/Lead: one nav pill leading here,
// then a grid of cards for each VC-specific view, instead of every new VC
// feature getting its own top-level nav slot (which is how "Messages"
// ended up wrapping awkwardly in the header on its own). Currently one
// card (Volunteer Messages) -- add more here as VC responsibilities grow
// (e.g. restricted-role approvals) rather than adding more nav links.
export default function VolunteerCoordinatorLanding() {
  const navigate = useNavigate();
  const isVolunteerCoordinator = hasRole("VolunteerCoordinator");

  useEffect(() => {
    if (!isVolunteerCoordinator) {
      navigate("/");
    }
  }, [isVolunteerCoordinator, navigate]);

  if (!isVolunteerCoordinator) return null;

  return (
    <div className="modern-page-container">
      <Header />

      <div className="modern-header-section">
        <div className="modern-header-content">
          <h1 className="modern-page-title">Volunteer Coordinator</h1>
          <p className="modern-page-subtitle">
            Tools for whoever's handling volunteer scheduling day-to-day.
          </p>
        </div>
      </div>

      <div className="modern-content-wrapper">
        <div className="vc-landing-grid">
          <Link to="/admin/messages" className="vc-landing-card">
            <div className="vc-landing-card-icon">💬</div>
            <h3 className="vc-landing-card-title">Volunteer Messages</h3>
            <p className="vc-landing-card-description">
              Messages sent through the in-app Contact Coordinator button.
            </p>
          </Link>
        </div>
      </div>
    </div>
  );
}