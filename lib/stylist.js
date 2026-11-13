// The stylist: turns a trip, its weather and the person's own clothes into
// outfit postcards for each top photo spot. Uses an NVIDIA language model.
import { askForJson } from "./nvidia.js";

// Ultra gives the best styling (~20s). If it fails, the faster Super model takes over.
export const STYLE_MODEL = process.env.STYLE_MODEL || "nvidia/nemotron-3-ultra-550b-a55b";
export const BACKUP_MODEL = "nvidia/nemotron-3.5-super-vl-120b-a12b";

const RULES = `You are Backdrop, a warm travel stylist. You style people for the BACKDROP of each photo spot, using ONLY clothes they already own.

Rules:
- Pick 4 of the destination's best-known photo spots, most famous first. Only real places you are sure exist at that destination.
- For each spot, describe the backdrop's 3–4 main colours (walls, sea, stone, foliage, sky at the best time) with hex codes.
- Build ONE outfit per spot from the closet, using item ids only. Prefer pieces whose colours CONTRAST with that backdrop so the person stands out; say plainly which closet pieces would blend in there.
- Every outfit MUST include shoes AND either (a top plus a bottom) or a dress. Add outerwear, a bag or an accessory when they help. Check each outfit before answering. If the closet has no piece for a slot, leave it out and list it as a gap. Never invent a piece.
- In every text field, call pieces by their name ("the rust skirt"), never by id or number.
- Dress for the weather you are given (temperatures in °C). Mention layers for cool evenings, rain or wind when relevant.
- Gaps are ONLY for things nothing in the closet can do (check every piece first, including extras). At most 3.
- Respect local culture properly: if a spot is a religious site or has a known dress rule (e.g. covered shoulders and knees), say so, and make that outfit comply if the closet allows. Phrase rules as "usually required; check signs on the day".
- Best time for light: name a time of day and why (e.g. "an hour before sunset, when the white walls glow gold").
- Tone: warm, encouraging, specific. Never comment on bodies, size or shape. Never tell anyone to buy anything; for gaps suggest packing or borrowing something similar.
- Keep each text field to one or two short sentences.

Answer with JSON only, exactly this shape:
{
  "spots": [{
    "name": "spot name",
    "backdrop": "what the backdrop looks like, in a few words",
    "backdropColours": [{"name": "whitewashed walls", "hex": "#F4F1EA"}],
    "outfit": ["item ids from the closet"],
    "why": "why these colours work against this backdrop",
    "blendIn": ["item ids that would disappear against this backdrop"],
    "bestTime": "when to go and why",
    "dressRule": "dress rule, or empty string",
    "weatherTip": "a weather-related tip for this outfit, or empty string"
  }],
  "extras": ["ids of closet pieces NOT used in any outfit that are still worth packing, e.g. a cardigan for cool evenings"],
  "gaps": [{"need": "what's missing", "why": "why it would help on this trip"}],
  "summary": "one sentence on dressing for this trip's weather"
}`;

export async function styleTrip(trip) {
  const closet = trip.items.map((it) =>
    `- ${it.id}: ${it.name} (${it.category}; ${it.colour || "colour unknown"} ${it.hex}${it.accent ? `; accent ${it.accent}` : ""}${it.fabric ? `; ${it.fabric}` : ""})`
  ).join("\n");
  const w = trip.weather;
  const weather = `${w.kind === "forecast" ? "Forecast" : "Typical weather for these dates (average of past years, not a forecast)"}: ` +
    `daytime highs around ${w.summary.avgHigh}°C (up to ${w.summary.high}°C), nights around ${w.summary.avgLow}°C (down to ${w.summary.low}°C), ` +
    `rain likely on ${w.summary.rainyDays} of ${w.summary.totalDays} days, windy on ${w.summary.windyDays}. ` +
    `Days: ${w.days.map((d) => `${d.date} ${d.sky} ${d.high}/${d.low}°C`).join("; ")}.`;

  const request = `Trip: ${trip.place.name}${trip.place.region ? `, ${trip.place.region}` : ""}${trip.place.country ? `, ${trip.place.country}` : ""}, ${trip.from} to ${trip.to}.
Who's dressing: ${trip.who}. Style: ${trip.styles.length ? trip.styles.join(" + ") : "no preference"}.
${weather}

Their closet (use these ids only):
${closet}`;

  const messages = [
    { role: "system", content: RULES },
    { role: "user", content: request },
  ];
  // Ultra first, Ultra once more if there's time, then the faster backup.
  // Everything must finish within ~55s (Vercel stops functions at 60s).
  const deadline = Date.now() + 55_000;
  const attempts = [STYLE_MODEL, STYLE_MODEL, BACKUP_MODEL];
  let lastError;
  for (const [i, model] of attempts.entries()) {
    const left = deadline - Date.now();
    const isLastUltra = i === 1;
    // Only retry Ultra if enough time is left for it AND for the backup.
    if (isLastUltra && left < 45_000) continue;
    if (left < 8_000) break;
    try {
      const timeoutMs = model === BACKUP_MODEL ? left : Math.min(35_000, left - 12_000);
      const answer = await askForJson({ model, messages, maxTokens: 3000, temperature: 0.4, timeoutMs });
      return { ...clean(answer, trip.items), model };
    } catch (err) {
      lastError = err;
      console.warn(`stylist: ${model} failed (${err.message})`);
    }
  }
  throw lastError ?? new Error("The stylist ran out of time.");
}

// Keep only what the page can trust: real item ids, valid colours, short text.
function clean(answer, items) {
  const ids = new Set(items.map((i) => String(i.id)));
  const realIds = (list) => [...new Set((Array.isArray(list) ? list : []).map(String).filter((id) => ids.has(id)))];
  // Models sometimes still say "item 9" or "(9)": swap ids for the piece's name.
  const names = Object.fromEntries(items.map((i) => [String(i.id), i.name]));
  const text = (v, max = 300) => (typeof v !== "string" ? "" : v
    .replace(/\s*\((?:item\s*)?#?(\d+)\)/gi, (m, id) => (names[id] ? "" : m))
    .replace(/\b(?:item|id)\s*#?(\d+)\b/gi, (m, id) => (names[id] ? `the ${names[id]}` : m))
    .trim().slice(0, max));
  const hex = (v) => (/^#[0-9a-f]{6}$/i.test(v) ? v.toUpperCase() : null);

  const spots = (Array.isArray(answer.spots) ? answer.spots : []).slice(0, 5).map((s) => ({
    name: text(s.name, 80),
    backdrop: text(s.backdrop, 160),
    backdropColours: (Array.isArray(s.backdropColours) ? s.backdropColours : [])
      .map((c) => ({ name: text(c?.name, 40), hex: hex(c?.hex) }))
      .filter((c) => c.hex)
      .slice(0, 5),
    outfit: realIds(s.outfit),
    why: text(s.why),
    blendIn: realIds(s.blendIn).filter((id) => !realIds(s.outfit).includes(id)),
    bestTime: text(s.bestTime, 200),
    dressRule: text(s.dressRule, 200),
    weatherTip: text(s.weatherTip, 200),
  })).filter((s) => s.name && s.outfit.length);

  if (!spots.length) throw new Error("The stylist didn't return any usable outfits.");

  // The model sometimes forgets shoes. If the closet has some, add a pair
  // (preferring shoes that don't blend into that backdrop).
  const shoes = items.filter((i) => i.category === "shoes").map((i) => String(i.id));
  for (const spot of spots) {
    const hasShoes = spot.outfit.some((id) => shoes.includes(id));
    if (!hasShoes && shoes.length) {
      spot.outfit.push(shoes.find((id) => !spot.blendIn.includes(id)) ?? shoes[0]);
    }
  }

  const used = realIds(spots.flatMap((s) => s.outfit));
  return {
    spots,
    packing: used,
    extras: realIds(answer.extras).filter((id) => !used.includes(id)),
    gaps: (Array.isArray(answer.gaps) ? answer.gaps : []).slice(0, 4)
      .map((g) => ({ need: text(g?.need, 100), why: text(g?.why, 200) }))
      .filter((g) => g.need),
    summary: text(answer.summary),
  };
}
