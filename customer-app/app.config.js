// Extends app.json with the Firebase config Android needs for push notifications.
// EAS builds get it from the GOOGLE_SERVICES_JSON file variable (set with `eas env:create`);
// a local ./google-services.json (gitignored) works for local builds.
const fs = require('fs');
const path = require('path');

module.exports = ({ config }) => {
  const local = path.join(__dirname, 'google-services.json');
  const googleServicesFile =
    process.env.GOOGLE_SERVICES_JSON ?? (fs.existsSync(local) ? './google-services.json' : undefined);
  return {
    ...config,
    android: { ...config.android, ...(googleServicesFile ? { googleServicesFile } : {}) },
  };
};
