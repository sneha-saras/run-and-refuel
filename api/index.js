// Vercel serverless entrypoint. Re-exports the Express app (which does NOT
// call listen() when process.env.VERCEL is set). Vercel routes /api/* and
// /callback here via vercel.json; Express matches the original request path.
module.exports = require("../server/index.js");
