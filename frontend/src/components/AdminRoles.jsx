import React, { useEffect, useMemo, useState, useId } from "react";
import Header from "./Header";
import "../styles/adminRoles.css";
import "../styles/shiftForm.css";
import "../styles/roleRequests.css";

export default function AdminRoles() {
  const [roles, setRoles] = useState([]);
  const [editingId, setEditingId] = useState(null);
  const [formVisible, setFormVisible] = useState(false);
  const [formData, setFormData] = useState({
    name: "",
    location: "",
    responsibilities: "",
    physicalRequirements: "",
    pointOfContact: "",
    contactPhone: "",
    restricted: false
  });

  // search/sort/filter state
  const [searchRaw, setSearchRaw] = useState("");
  const [search, setSearch] = useState("");
  const [sortBy, setSortBy] = useState("name");
  const [sortDir, setSortDir] = useState("asc");
  const [hasContact, setHasContact] = useState(false);
  const [hasPhysicalReqs, setHasPhysicalReqs] = useState(false);

  useEffect(() => {
    fetch(`${process.env.REACT_APP_API_BASE}/api/shiftroles`)
      .then(res => res.json())
      .then(data => setRoles(Array.isArray(data) ? data : []))
      .catch(err => console.error("Error loading roles:", err));
  }, []);

  // debounce search
  useEffect(() => {
    const t = setTimeout(() => setSearch(searchRaw.trim().toLowerCase()), 200);
    return () => clearTimeout(t);
  }, [searchRaw]);

  const openForm = (role = null) => {
    if (role) {
      setEditingId(role._id);
      setFormData({
        name: role.name || "",
        location: role.location || "",
        responsibilities: role.responsibilities || "",
        physicalRequirements: role.physicalRequirements || "",
        pointOfContact: role.pointOfContact || "",
        contactPhone: role.contactPhone || "",
        restricted: !!role.restricted
      });
    } else {
      setEditingId(null);
      setFormData({
        name: "",
        location: "",
        responsibilities: "",
        physicalRequirements: "",
        pointOfContact: "",
        contactPhone: "",
        restricted: false
      });
    }
    setFormVisible(true);
  };

  const closeForm = () => setFormVisible(false);

  const handleChange = e => {
    const { name, value, type, checked } = e.target;
    setFormData(prev => ({ ...prev, [name]: type === "checkbox" ? checked : value }));
  };

  const handleSubmit = async e => {
    e.preventDefault();
    const method = editingId ? "PATCH" : "POST";
    const url = editingId
      ? `${process.env.REACT_APP_API_BASE}/api/shiftroles/${editingId}`
      : `${process.env.REACT_APP_API_BASE}/api/shiftroles`;

    try {
      const res = await fetch(url, {
        method,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(formData)
      });
      const newRole = await res.json();

      if (!res.ok) throw new Error(newRole?.message || "Save failed");

      if (editingId) setRoles(prev => prev.map(r => (r._id === editingId ? newRole : r)));
      else setRoles(prev => [...prev, newRole]);

      closeForm();
    } catch (err) {
      console.error("Error saving role:", err);
      alert("Could not save role.");
    }
  };

  const handleDelete = async id => {
    if (!window.confirm("Delete this role?")) return;
    try {
      const res = await fetch(`${process.env.REACT_APP_API_BASE}/api/shiftroles/${id}`, {
        method: "DELETE"
      });
      if (res.ok) setRoles(prev => prev.filter(r => r._id !== id));
      else alert("Delete failed.");
    } catch (err) {
      console.error("Error deleting role:", err);
      alert("Delete failed.");
    }
  };

  // filtered + sorted roles
  const filteredSortedRoles = useMemo(() => {
    const q = search;
    const by = sortBy;
    const dir = sortDir === "asc" ? 1 : -1;

    const matchSearch = r => {
      if (!q) return true;
      const fields = [r.name, r.location, r.responsibilities, r.pointOfContact]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return fields.includes(q);
    };

    const matchContact = r =>
      !hasContact
        ? true
        : Boolean(
            (r.pointOfContact && r.pointOfContact.trim()) ||
            (r.contactPhone && r.contactPhone.toString().trim())
          );

    const matchPhys = r =>
      !hasPhysicalReqs ? true : Boolean(r.physicalRequirements && r.physicalRequirements.trim());

    const sorted = [...roles]
      .filter(r => matchSearch(r) && matchContact(r) && matchPhys(r))
      .sort((a, b) => {
        const aVal = (a[by] || "").toString().toLowerCase();
        const bVal = (b[by] || "").toString().toLowerCase();
        if (aVal < bVal) return -1 * dir;
        if (aVal > bVal) return 1 * dir;

        const aName = (a.name || "").toLowerCase();
        const bName = (b.name || "").toLowerCase();
        if (aName < bName) return -1;
        if (aName > bName) return 1;
        return (a._id || "").localeCompare(b._id || "");
      });

    return sorted;
  }, [roles, search, sortBy, sortDir, hasContact, hasPhysicalReqs]);

  const clearFilters = () => {
    setSearchRaw("");
    setHasContact(false);
    setHasPhysicalReqs(false);
    setSortBy("name");
    setSortDir("asc");
  };

  return (
    <div className="modern-page-container">
      <Header />

      {/* Modern Header */}
      <div className="modern-header-section">
        <div className="modern-header-content">
          <h1 className="modern-page-title">Volunteer Role Management</h1>
          <p className="modern-page-subtitle">Create and manage volunteer opportunities</p>
        </div>
      </div>

      <div className="modern-content-wrapper">
        {/* Action Bar */}
        <div className="modern-action-bar">
          <button onClick={() => openForm()} className="modern-primary-button">
            <span className="button-icon">➕</span>
            Add New Role
          </button>
        </div>

        {/* Controls row */}
        <div className="roles-controls">
          <div className="roles-controls-left">
            <div className="roles-control">
              <label className="roles-control-label">Search</label>
              <input
                className="roles-control-input"
                placeholder="Search name, location, responsibilities…"
                value={searchRaw}
                onChange={e => setSearchRaw(e.target.value)}
              />
            </div>

            <div className="roles-control checkbox">
              <label className="roles-control-checkbox">
                <input
                  type="checkbox"
                  checked={hasContact}
                  onChange={(e) => setHasContact(e.target.checked)}
                />
                Has contact info
              </label>
            </div>

            <div className="roles-control checkbox">
              <label className="roles-control-checkbox">
                <input
                  type="checkbox"
                  checked={hasPhysicalReqs}
                  onChange={(e) => setHasPhysicalReqs(e.target.checked)}
                />
                Has physical requirements
              </label>
            </div>
          </div>

          <div className="roles-controls-right">
            <div className="roles-control">
              <label className="roles-control-label">Sort by</label>
              <select
                className="roles-control-select"
                value={sortBy}
                onChange={e => setSortBy(e.target.value)}
              >
                <option value="name">Name</option>
                <option value="location">Location</option>
              </select>
            </div>

            <button
              className="roles-sort-dir-btn"
              onClick={() => setSortDir(d => (d === "asc" ? "desc" : "asc"))}
              title={sortDir === "asc" ? "Ascending" : "Descending"}
            >
              {sortDir === "asc" ? "↑ A–Z" : "↓ Z–A"}
            </button>

            <button className="roles-clear-btn" onClick={clearFilters}>Clear</button>
          </div>
        </div>

        {/* Roles Section */}
        <div className="modern-roles-section">
          <div className="modern-section-header">
            <h2 className="modern-section-title">
              Current Roles ({filteredSortedRoles.length}
              {filteredSortedRoles.length !== roles.length ? ` of ${roles.length}` : ""})
            </h2>
          </div>

          {roles.length === 0 ? (
            <div className="modern-empty-state">
              <div className="modern-empty-icon">📋</div>
              <h3 className="modern-empty-title">No roles yet</h3>
              <p className="modern-empty-description">Create your first volunteer role to get started</p>
              <button onClick={() => openForm()} className="modern-primary-button">
                <span className="button-icon">➕</span>
                Add First Role
              </button>
            </div>
          ) : (
            <div className="modern-roles-grid">
              {filteredSortedRoles.map(role => (
                <div key={role._id} className="modern-role-card">
                  {/* Card Header */}
                  <div className="modern-card-header">
                    <div className="modern-card-title-section">
                      <h3 className="modern-card-title">{role.name}</h3>
                      <div className="modern-card-actions">
                        <button
                          onClick={() => openForm(role)}
                          className="modern-edit-button"
                          title="Edit role"
                        >
                          ✏️
                        </button>
                        <button
                          onClick={() => handleDelete(role._id)}
                          className="modern-delete-button"
                          title="Delete role"
                        >
                          🗑️
                        </button>
                      </div>
                    </div>

                    {role.location && (
                      <div className="modern-location-tag">
                        📍 {role.location}
                      </div>
                    )}

                    {role.restricted && (
                      <div className="modern-card-tags-row">
                        <span className="restricted-role-tag" title="Volunteers must be approved before they can sign up">
                          🔒 Restricted
                        </span>
                      </div>
                    )}
                  </div>

                  {/* Card Content */}
                  <div className="modern-card-content">
                    <Expandable title="📝 Responsibilities">
                      <p className="modern-card-text">{role.responsibilities}</p>
                    </Expandable>

                    {role.physicalRequirements && (
                      <Expandable title="👤 Physical Requirements">
                        <p className="modern-card-text">{role.physicalRequirements}</p>
                      </Expandable>
                    )}

                    {(role.pointOfContact || role.contactPhone) && (
                      <div className="modern-card-contact">
                        <h4 className="modern-card-section-title">Contact</h4>
                        <div className="modern-contact-info">
                          {role.pointOfContact && (
                            <p className="modern-contact-item">👤 {role.pointOfContact}</p>
                          )}
                          {role.contactPhone && (
                            <a href={`tel:${role.contactPhone}`} className="modern-contact-phone">
                              📞 {role.contactPhone}
                            </a>
                          )}
                        </div>
                      </div>
                    )}
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Modal */}
        {formVisible && (
          <div className="modern-modal-overlay">
            <div className="modern-modal">
              <div className="modern-modal-header">
                <div className="modern-modal-title-section">
                  <h2 className="modern-modal-title">
                    {editingId ? "Edit Role" : "Create New Role"}
                  </h2>
                  <button onClick={closeForm} className="modern-close-button">✕</button>
                </div>
              </div>

              <div className="modern-modal-content">
                <form onSubmit={handleSubmit} className="modern-form">
                  <div className="modern-form-group">
                    <label className="modern-form-label">📋 Role Name *</label>
                    <input
                      name="name"
                      value={formData.name}
                      onChange={handleChange}
                      required
                      className="modern-form-input"
                      placeholder="e.g., Event Coordinator"
                    />
                  </div>

                  <div className="modern-form-group">
                    <label className="modern-form-label">📍 Location</label>
                    <input
                      name="location"
                      value={formData.location}
                      onChange={handleChange}
                      className="modern-form-input"
                      placeholder="e.g., Main Venue, Building A"
                    />
                  </div>

                  <div className="modern-form-group">
                    <label className="modern-form-label">📝 Responsibilities *</label>
                    <textarea
                      name="responsibilities"
                      value={formData.responsibilities}
                      onChange={handleChange}
                      required
                      rows={4}
                      className="modern-form-textarea"
                      placeholder="Describe the key responsibilities and duties..."
                    />
                  </div>

                  <div className="modern-form-group">
                    <label className="modern-form-label">👤 Physical Requirements</label>
                    <textarea
                      name="physicalRequirements"
                      value={formData.physicalRequirements}
                      onChange={handleChange}
                      rows={3}
                      className="modern-form-textarea"
                      placeholder="Any physical requirements or limitations..."
                    />
                  </div>

                  <div className="modern-form-row">
                    <div className="modern-form-group">
                      <label className="modern-form-label">👤 Point of Contact</label>
                      <input
                        name="pointOfContact"
                        value={formData.pointOfContact}
                        onChange={handleChange}
                        className="modern-form-input"
                        placeholder="Contact person name"
                      />
                    </div>

                    <div className="modern-form-group">
                      <label className="modern-form-label">📞 Contact Phone</label>
                      <input
                        type="tel"
                        name="contactPhone"
                        value={formData.contactPhone}
                        onChange={handleChange}
                        className="modern-form-input"
                        placeholder="(555) 123-4567"
                      />
                    </div>
                  </div>

                  <div className="modern-form-group">
                    <label className="restricted-checkbox-label">
                      <input
                        type="checkbox"
                        name="restricted"
                        checked={formData.restricted}
                        onChange={handleChange}
                      />
                      <span>
                        🔒 Restricted role — volunteers must request and be approved before they can sign up for shifts under this role.
                      </span>
                    </label>
                  </div>

                  <div className="modern-form-actions">
                    <button type="submit" className="modern-submit-button">
                      💾 {editingId ? "Save Changes" : "Create Role"}
                    </button>
                    <button type="button" onClick={closeForm} className="modern-cancel-button">
                      ✕ Cancel
                    </button>
                  </div>
                </form>
              </div>
            </div>
          </div>
        )}

      </div>
    </div>
  );
}

// Expandable section
function Expandable({ title, children, defaultOpen = false }) {
  const [open, setOpen] = useState(defaultOpen);
  const id = useId();

  return (
    <div className="modern-card-section">
      <div className="modern-card-section-header">
        <h4 className="modern-card-section-title">{title}</h4>
        <button
          type="button"
          className="modern-readmore-btn"
          aria-expanded={open}
          aria-controls={id}
          onClick={() => setOpen(o => !o)}
        >
          {open ? "Show less" : "Read more"}
        </button>
      </div>

      <div id={id} className={open ? "clamp-off" : "clamp-3"}>
        {children}
      </div>
    </div>
  );
}