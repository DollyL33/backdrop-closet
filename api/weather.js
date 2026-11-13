// GET /api/weather?lat=..&lon=..&from=YYYY-MM-DD&to=YYYY-MM-DD
import { getWeather } from "../lib/weather.js";
import { tooManyRequests } from "../lib/rate-limit.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;

export async function GET(request) {
  if (tooManyRequests(request, { limit: 120 })) {
    return Response.json({ error: "Too many weather checks. Please wait a little." }, { status: 429 });
  }
  const p = new URL(request.url).searchParams;
  const lat = Number(p.get("lat")), lon = Number(p.get("lon"));
  const from = p.get("from"), to = p.get("to");
  if (!Number.isFinite(lat) || !Number.isFinite(lon) || !DATE.test(from) || !DATE.test(to) || to < from) {
    return Response.json({ error: "Please choose a place and valid dates." }, { status: 400 });
  }
  if ((Date.parse(to) - Date.parse(from)) / 864e5 > 30) {
    return Response.json({ error: "Trips of up to 31 days, please." }, { status: 400 });
  }
  try {
    return Response.json(await getWeather({ lat, lon }, from, to));
  } catch (err) {
    console.error("weather:", err.message);
    return Response.json({ error: "We couldn't get the weather right now." }, { status: 502 });
  }
}
