// api/country.js
export default async function handler(req, res) {
  const country = req.headers["x-vercel-ip-country"] || "";
  res.setHeader("Cache-Control", "no-store");
  res.status(200).json({ country });
}
