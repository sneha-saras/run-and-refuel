const fs = require("fs");
const path = require("path");

// On Vercel the project filesystem is read-only; /tmp is the only writable
// location (ephemeral — resets on cold starts). Locally we use the repo copy.
const DATA_FILE = process.env.VERCEL
  ? path.join("/tmp", "data.json")
  : path.join(__dirname, "data.json");

const EMPTY_DB = {
  profile: null, // { goal, diet, cuisine, effort, weightKg }
  activityLog: [], // array of activity records (newest last)
  stravaTokens: null, // { access, refresh, expiresAt } — Phase 4
};

function readData() {
  try {
    const raw = fs.readFileSync(DATA_FILE, "utf8");
    const parsed = JSON.parse(raw);
    // Merge onto defaults so missing keys never break callers.
    return { ...EMPTY_DB, ...parsed };
  } catch (err) {
    // File missing or unreadable -> start fresh.
    return { ...EMPTY_DB };
  }
}

function writeData(data) {
  fs.writeFileSync(DATA_FILE, JSON.stringify(data, null, 2), "utf8");
  return data;
}

function getProfile() {
  return readData().profile;
}

function saveProfile(profile) {
  const db = readData();
  db.profile = profile;
  writeData(db);
  return profile;
}

function addActivity(record) {
  const db = readData();
  db.activityLog.push(record);
  writeData(db);
  return record;
}

function getActivityLog() {
  return readData().activityLog;
}

function getLatestActivity() {
  const log = readData().activityLog;
  return log.length ? log[log.length - 1] : null;
}

module.exports = {
  DATA_FILE,
  readData,
  writeData,
  getProfile,
  saveProfile,
  addActivity,
  getActivityLog,
  getLatestActivity,
};
