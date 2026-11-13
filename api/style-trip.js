// POST { place, from, to, who, styles, items } -> outfit postcards.
// The weather is fetched again here, so the AI always styles for real data.
import { styleTrip } from "../lib/stylist.js";
import { getWeather } from "../lib/weather.js";
import { tooManyRequests } from "../lib/rate-limit.js";

const DATE = /^\d{4}-\d{2}-\d{2}$/;
const CATEGORIES = ["top", "bottom", "dress", "outerwear", "shoes", "bag", "accessory"];

export async function POST(request) {
  if (tooManyRequests(request, { limit: 20 })) {
    return Response.json({ error: "You've styled a lot of trips this hour. Please try again later." }, { status: 429 });
  }
  const body = await request.json().catch(() => null);
  const trip = validate(body);
  if (typeof trip === "string") return Response.json({ error: trip }, { status: 400 });

  try {
    trip.weather = await getWeather(trip.place, trip.from, trip.to);
    const result = await styleTrip(trip);
    return Response.json({ ...result, weather: trip.weather });
  } catch (err) {
    console.error("style-trip:", err.message);
    return Response.json({ error: "The stylist couldn't finish this time. Please try again." }, { status: 502 });
  }
}

function validate(b) {
  if (!b || typeof b !== "object") return "Missing trip details.";
  const p = b.place;
  if (!p || typeof p.name !== "string" || !Number.isFinite(p.lat) || !Number.isFinite(p.lon)) return "Please choose where you're going.";
  if (!DATE.test(b.from) || !DATE.test(b.to) || b.to < b.from) return "Please choose valid dates.";
  if (!Array.isArray(b.items) || b.items.length < 3) return "Add at least 3 pieces.";
  if (b.items.length > 40) return "Up to 40 pieces, please.";
  const t = (v, max) => (typeof v === "string" ? v.replace(/[\n\r]/g, " ").trim().slice(0, max) : "");
  return {
    place: { name: t(p.name, 80), region: t(p.region, 80), country: t(p.country, 80), lat: p.lat, lon: p.lon },
    from: b.from,
    to: b.to,
    who: ["Woman", "Man", "Anyone"].includes(b.who) ? b.who : "Anyone",
    styles: (Array.isArray(b.styles) ? b.styles : []).map((s) => t(s, 20)).slice(0, 2),
    items: b.items.map((it) => ({
      id: String(it.id).slice(0, 10),
      name: t(it.name, 60) || "clothing item",
      category: CATEGORIES.includes(it.category) ? it.category : "top",
      colour: t(it.colour, 40),
      hex: /^#[0-9a-f]{6}$/i.test(it.hex) ? it.hex : "#999999",
      accent: t(it.accent, 40),
      fabric: t(it.fabric, 30),
    })),
  };
}
