import React from "react";
import { Routes, Route } from "react-router-dom";
import Home from "./components/Home";
import VolunteerShifts from "./components/VolunteerShifts";
import AdminDashboard from "./components/AdminDashboard";
import AdminRoles from "./components/AdminRoles";
import UserProfile from "./components/UserProfile";
import AdminShiftOverview from "./components/AdminShiftOverview";
import AdminVolunteers from "./components/AdminVolunteers";
import AdminHourlyNeeds from "./components/AdminHourlyNeeds";
//import Callback from "./components/Callback";
import OAuthCallback from "./components/OAuthCallback";
import PrivateRoute from "./components/PrivateRoute";
import AdminEvents from "./components/AdminEvents";
import AdminLanding from "./components/AdminLanding";
import AdminRoleView from "./components/AdminRoleView";
import AdminAllTimeline from "./components/AdminAllTimeline";
import AdminContactMessages from "./components/AdminContactMessages";
import VolunteerCoordinatorLanding from "./components/VolunteerCoordinatorLanding";

function App() {
  return (
    <Routes>
      <Route path="/" element={<Home />} />
      <Route path="/volunteer" element={<VolunteerShifts />} />
      <Route
        path="/profile"
        element={
          <PrivateRoute>
            <UserProfile />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin"
        element={
          <PrivateRoute>
            <AdminLanding />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/all"
        element={
          <PrivateRoute>
            <AdminDashboard />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/shifts"
        element={
          <PrivateRoute>
            <AdminShiftOverview />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/roles"
        element={
          <PrivateRoute>
            <AdminRoles />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/volunteers"
        element={
          <PrivateRoute>
            <AdminVolunteers />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/hourly-needs"
        element={
          <PrivateRoute>
            <AdminHourlyNeeds />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/role/:roleName"
        element={
          <PrivateRoute>
            <AdminRoleView />
          </PrivateRoute>
        }
      />
      <Route
        path="/admin/events"
        element={
          <PrivateRoute>
            <AdminEvents />
          </PrivateRoute>
        }
      />
      <Route path="/admin/all-timeline" element={<PrivateRoute><AdminAllTimeline /></PrivateRoute>} />
      <Route
        path="/admin/messages"
        element={
          <PrivateRoute>
            <AdminContactMessages />
          </PrivateRoute>
        }
      />
      <Route
        path="/vc"
        element={
          <PrivateRoute>
            <VolunteerCoordinatorLanding />
          </PrivateRoute>
        }
      />
      {/* <Route path="/callback" element={<Callback />} /> */}
      <Route path="/oauth-callback" element={<OAuthCallback />} />
    </Routes>
  );
}

export default App;