const axios = require("axios");
const User = require("../models/User");

// Was FUSIONAUTH_BASE_URL, which isn't an env var that's actually set
// anywhere -- authRoutes.js's login/token-exchange flow (the thing that's
// actually been working) hits this exact same /oauth2/userinfo endpoint
// using FUSIONAUTH_DOMAIN. Matching that instead of a never-configured
// variable.
const FA_BASE = process.env.FUSIONAUTH_DOMAIN;

// Decodes the access token's own JWT payload -- NOT a network call, just
// base64. This is how the frontend already determines roles (see
// authUtils.js's getRoles/hasRole), so it's a proven source for them.
// /oauth2/userinfo is a separate OIDC endpoint and was never actually
// asked for roles here -- req.user never got .roles/.faRoles set from
// anywhere, so every requireLeadOrAdmin check in this app has been
// silently returning 403 regardless of the real user's role. Decoding
// locally also means this no longer depends on FUSIONAUTH_DOMAIN being
// reachable just to figure out who's an Admin.
function decodeJwtPayload(token) {
  try {
    const base64Url = token.split(".")[1];
    const base64 = base64Url.replace(/-/g, "+").replace(/_/g, "/");
    return JSON.parse(Buffer.from(base64, "base64").toString("utf8"));
  } catch (err) {
    console.error("❌ Failed to decode access token payload:", err.message);
    return null;
  }
}

const authenticateUser = async (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith("Bearer ")) {
    return res.status(401).json({ message: "Missing or invalid token" });
  }

  const token = authHeader.split(" ")[1];

  try {
    const faResponse = await axios.get(`${FA_BASE}/oauth2/userinfo`, {
      headers: { Authorization: `Bearer ${token}` },
    });

    const { sub: fusionAuthId, email, name } = faResponse.data;

    let user = await User.findOne({ fusionAuthId });
    if (!user) {
      user = new User({
        fusionAuthId,
        email,
        preferredName: name || email.split("@")[0],
        volunteerShifts: [],
        totalHours: 0,
      });
      await user.save();
    }

    const decoded = decodeJwtPayload(token);
    const roles = decoded?.roles || [];

    req.user = user;
    // Both names are set -- userRoutes.js's requireLeadOrAdmin checks
    // req.user.roles, adminVolunteerRoutes.js's checks req.user.faRoles.
    // Same data, two call sites that grew independently; not consolidating
    // that into one shared gate right now, just making sure both actually
    // get populated.
    req.user.roles = roles;
    req.user.faRoles = roles;
    next();
  } catch (err) {
    // err.message alone is just "Request failed with status code 400" --
    // useless for telling "token expired" apart from "FusionAuth app
    // config issue" apart from anything else. err.response.data is
    // FusionAuth's actual error body when it's an HTTP error (vs. a
    // network-level failure, where there's no response at all).
    console.error(
      "❌ Authentication failed:",
      err.response?.data || err.message
    );
    res.status(401).json({ message: "Unauthorized" });
  }
};

module.exports = authenticateUser;