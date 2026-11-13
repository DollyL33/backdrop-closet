// Real places and real weather from Open-Meteo (free, no key needed).
//   findPlaces("Amalfi, Italy")  -> a few matching places to choose from
//   getWeather(place, from, to)  -> the forecast, or typical weather from past years
const GEO = "https://geocoding-api.open-meteo.com/v1/search";
const FORECAST = "https://api.open-meteo.com/v1/forecast";
const ARCHIVE = "https://archive-api.open-meteo.com/v1/archive";

const FORECAST_DAYS = 16;   // Open-Meteo forecasts this far ahead
const PAST_YEARS = 3;       // "typical" = average of the same dates over 3 years
const DAY = 864e5;

// ---------- Places ----------

export async function findPlaces(query) {
  // "Amalfi, Italy" -> search "Amalfi", then prefer results in Italy.
  const [name, ...rest] = query.split(",").map((s) => s.trim()).filter(Boolean);
  if (!name) return [];
  const hint = rest.join(" ").toLowerCase();

  const url = `${GEO}?name=${encodeURIComponent(name)}&count=10&language=en&format=json`;
  const data = await getJson(url);
  const places = (data.results ?? []).map((r) => ({
    name: r.name,
    region: r.admin1 ?? "",
    country: r.country ?? "",
    lat: r.latitude,
    lon: r.longitude,
    population: r.population ?? 0,
    kind: r.feature_code,
  }));

  const matchesHint = (p) => hint && `${p.region} ${p.country}`.toLowerCase().includes(hint);
  const isAirport = (p) => p.kind === "AIRP";
  const seen = new Set();
  const isDuplicate = (p) => {
    const key = `${p.name}|${p.region}|${p.country}`;
    return seen.has(key) || !seen.add(key);
  };
  return places
    .filter((p) => !isAirport(p))
    .sort((a, b) => matchesHint(b) - matchesHint(a) || b.population - a.population)
    .filter((p) => !isDuplicate(p))
    .slice(0, 5)
    .map(({ population, kind, ...p }) => p);
}

// ---------- Weather ----------

export async function getWeather({ lat, lon }, from, to) {
  const today = startOfDay(new Date());
  const start = new Date(from + "T00:00:00Z");
  const end = new Date(to + "T00:00:00Z");
  const lastForecastDay = new Date(today.getTime() + (FORECAST_DAYS - 1) * DAY);

  if (end <= lastForecastDay && start >= today) {
    return { kind: "forecast", ...(await forecast(lat, lon, from, to)) };
  }
  return { kind: "typical", ...(await typical(lat, lon, start, end)) };
}

const DAILY = "temperature_2m_max,temperature_2m_min,precipitation_sum,precipitation_probability_max,weather_code,wind_speed_10m_max";

async function forecast(lat, lon, from, to) {
  const url = `${FORECAST}?latitude=${lat}&longitude=${lon}&daily=${DAILY}&start_date=${from}&end_date=${to}&timezone=auto`;
  const d = (await getJson(url)).daily;
  const days = d.time.map((date, i) => ({
    date,
    high: round(d.temperature_2m_max[i]),
    low: round(d.temperature_2m_min[i]),
    rainMm: round(d.precipitation_sum[i], 1),
    rainChance: d.precipitation_probability_max[i],
    wind: round(d.wind_speed_10m_max[i]),
    sky: describe(d.weather_code[i]),
  }));
  return { days, summary: summarise(days) };
}

// Same calendar dates in each of the last few years, averaged day by day.
async function typical(lat, lon, start, end) {
  const thisYear = new Date().getUTCFullYear();
  const years = Array.from({ length: PAST_YEARS }, (_, i) => thisYear - 1 - i);
  const runs = await Promise.all(years.map((y) => {
    const shift = (d) => iso(new Date(Date.UTC(d.getUTCFullYear() - (start.getUTCFullYear() - y), d.getUTCMonth(), d.getUTCDate())));
    const url = `${ARCHIVE}?latitude=${lat}&longitude=${lon}&daily=temperature_2m_max,temperature_2m_min,precipitation_sum,weather_code,wind_speed_10m_max&start_date=${shift(start)}&end_date=${shift(end)}&timezone=auto`;
    return getJson(url).then((r) => r.daily);
  }));

  const n = Math.min(...runs.map((r) => r.time.length));
  const days = [];
  for (let i = 0; i < n; i++) {
    const avg = (key) => mean(runs.map((r) => r[key][i]));
    const wetYears = runs.filter((r) => r.precipitation_sum[i] >= 1).length;
    days.push({
      date: iso(new Date(start.getTime() + i * DAY)),
      high: round(avg("temperature_2m_max")),
      low: round(avg("temperature_2m_min")),
      rainMm: round(avg("precipitation_sum"), 1),
      rainChance: Math.round((wetYears / runs.length) * 100),
      wind: round(avg("wind_speed_10m_max")),
      sky: describe(mostCommon(runs.map((r) => r.weather_code[i]))),
    });
  }
  return { days, summary: summarise(days), basedOn: years };
}

function summarise(days) {
  const highs = days.map((d) => d.high).filter(Number.isFinite);
  const lows = days.map((d) => d.low).filter(Number.isFinite);
  return {
    high: Math.max(...highs),
    low: Math.min(...lows),
    avgHigh: round(mean(highs)),
    avgLow: round(mean(lows)),
    rainyDays: days.filter((d) => d.rainChance >= 50 || d.rainMm >= 2).length,
    windyDays: days.filter((d) => d.wind >= 30).length,
    totalDays: days.length,
  };
}

// WMO weather codes -> plain words.
function describe(code) {
  if (code == null) return "unknown";
  if (code === 0) return "clear";
  if (code <= 2) return "partly cloudy";
  if (code === 3) return "overcast";
  if (code <= 48) return "foggy";
  if (code <= 57) return "drizzle";
  if (code <= 67) return "rain";
  if (code <= 77) return "snow";
  if (code <= 82) return "showers";
  if (code <= 86) return "snow showers";
  return "thunderstorms";
}

// ---------- Small helpers ----------

async function getJson(url) {
  const res = await fetch(url, { signal: AbortSignal.timeout(15_000) });
  if (!res.ok) throw new Error(`Open-Meteo returned ${res.status}: ${(await res.text()).slice(0, 200)}`);
  return res.json();
}
const iso = (d) => d.toISOString().slice(0, 10);
const startOfDay = (d) => new Date(Date.UTC(d.getFullYear(), d.getMonth(), d.getDate()));
const mean = (xs) => { const v = xs.filter(Number.isFinite); return v.length ? v.reduce((a, b) => a + b, 0) / v.length : NaN; };
const round = (x, dp = 0) => (Number.isFinite(x) ? Math.round(x * 10 ** dp) / 10 ** dp : null);
const mostCommon = (xs) => {
  const counts = new Map();
  for (const x of xs) if (x != null) counts.set(x, (counts.get(x) ?? 0) + 1);
  return [...counts].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0]?.[0];
};
