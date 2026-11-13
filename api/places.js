// GET /api/places?q=Amalfi, Italy  ->  { places: [{ name, region, country, lat, lon }] }
import { findPlaces } from "../lib/weather.js";
import { tooManyRequests } from "../lib/rate-limit.js";

export async function GET(request) {
  if (tooManyRequests(request, { limit: 300 })) {
    return Response.json({ error: "Too many searches. Please wait a little." }, { status: 429 });
  }
  const q = (new URL(request.url).searchParams.get("q") || "").trim().slice(0, 80);
  if (q.length < 2) return Response.json({ places: [] });
  try {
    return Response.json({ places: await findPlaces(q) });
  } catch (err) {
    console.error("places:", err.message);
    return Response.json({ error: "We couldn't look up places right now." }, { status: 502 });
  }
}
