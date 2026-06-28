/* ============================================================
   Auralis Weather — Vanilla JS controller
============================================================ */
(() => {
  "use strict";

  const API_KEY = "e024947bb8a35e5e7faec151062c7b0a";
  const BASE = "https://api.weatherapi.com/v1";
  const OPEN_METEO_FORECAST = "https://api.open-meteo.com/v1/forecast";
  const OPEN_METEO_GEOCODE = "https://geocoding-api.open-meteo.com/v1/search";
  const OPEN_METEO_REVERSE = "https://geocoding-api.open-meteo.com/v1/reverse";

  /* ---------- State ---------- */
  const state = {
    units: localStorage.getItem("units") || "c", // 'c' | 'f'
    theme: localStorage.getItem("theme") || "light",
    last: null, // last forecast payload
    recent: JSON.parse(localStorage.getItem("recent") || "[]"),
    favorites: JSON.parse(localStorage.getItem("favorites") || "[]"),
  };

  /* ---------- Element helpers ---------- */
  const $ = (id) => document.getElementById(id);
  const el = {
    html: document.documentElement,
    menuBtn: $("menuBtn"), sidebar: $("sidebar"), scrim: $("scrim"),
    searchForm: $("searchForm"), searchInput: $("searchInput"), suggest: $("suggest"),
    locBtn: $("locBtn"), unitToggle: $("unitToggle"), themeBtn: $("themeBtn"),
    offlineBanner: $("offlineBanner"), errorBanner: $("errorBanner"),
    locName: $("locName"), locMeta: $("locMeta"), favBtn: $("favBtn"),
    heroIcon: $("heroIcon"), tempBig: $("tempBig"), tempCond: $("tempCond"), tempFeels: $("tempFeels"),
    heroQuick: $("heroQuick"), highlightsGrid: $("highlightsGrid"),
    hourlyScroll: $("hourlyScroll"), dailyList: $("dailyList"),
    mapFrame: $("mapFrame"), alertsSection: $("alerts"), alertsWrap: $("alertsWrap"),
    favList: $("favList"), recentList: $("recentList"), year: $("year"),
  };

  /* ---------- Utility ---------- */
  const round = (n) => Math.round(n);
  const temp = (c, f) => (state.units === "c" ? `${round(c)}°` : `${round(f)}°`);
  const tempUnit = (c, f) => (state.units === "c" ? `${round(c)}°C` : `${round(f)}°F`);
  const speed = (kph, mph) => (state.units === "c" ? `${round(kph)} km/h` : `${round(mph)} mph`);
  const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

  /* Map WeatherAPI condition codes / day to emoji */
  function emojiFor(code, isDay = 1) {
    const c = code;
    if (c === 1000) return isDay ? "☀️" : "🌙";
    if ([1003].includes(c)) return isDay ? "⛅" : "☁️";
    if ([1006, 1009].includes(c)) return "☁️";
    if ([1030, 1135, 1147].includes(c)) return "🌫️";
    if ([1063, 1150, 1153, 1180, 1183, 1186, 1189, 1240].includes(c)) return "🌦️";
    if ([1192, 1195, 1243, 1246].includes(c)) return "🌧️";
    if ([1273, 1276, 1279, 1282, 1087].includes(c)) return "⛈️";
    if ([1066, 1114, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258, 1117].includes(c)) return "❄️";
    if ([1069, 1072, 1168, 1171, 1198, 1201, 1204, 1207, 1237, 1249, 1252, 1261, 1264].includes(c)) return "🌨️";
    return "🌡️";
  }

  /* Map condition text -> background scene key */
  function sceneFor(code, isDay) {
    if (!isDay) return "night";
    if (code === 1000) return "sunny";
    if ([1003, 1006, 1009, 1030, 1135, 1147].includes(code)) return "cloudy";
    if ([1273, 1276, 1279, 1282, 1087].includes(code)) return "thunder";
    if ([1066, 1114, 1117, 1210, 1213, 1216, 1219, 1222, 1225, 1255, 1258].includes(code)) return "snow";
    if (code >= 1063) return "rain";
    return "sunny";
  }

  /* ---------- Background scenes ---------- */
  const gradients = {
    sunny: "linear-gradient(160deg,#cfe9ff 0%,#f5f7fb 50%,#ffe9b8 100%)",
    rain: "linear-gradient(160deg,#8fb3d9 0%,#aebfd6 60%,#d6e2ef 100%)",
    cloudy: "linear-gradient(160deg,#dfe6ee 0%,#eef1f6 60%,#cfd6e0 100%)",
    snow: "linear-gradient(160deg,#eaf3ff 0%,#ffffff 60%,#d8e8ff 100%)",
    thunder: "linear-gradient(160deg,#3a2f5c 0%,#2a2440 60%,#4b3b6b 100%)",
    night: "linear-gradient(160deg,#0b1430 0%,#10162e 55%,#1d2748 100%)",
  };
  function setScene(key) {
    $("bgGradient").style.background = gradients[key] || gradients.sunny;
    const map = { clouds: "layerClouds", rain: "layerRain", snow: "layerSnow", stars: "layerStars", sun: "layerSun", lightning: "layerLightning" };
    Object.values(map).forEach((id) => $(id).classList.remove("on"));
    const on = (id) => $(id).classList.add("on");
    if (key === "sunny") { on("layerSun"); on("layerClouds"); }
    else if (key === "cloudy") on("layerClouds");
    else if (key === "rain") { on("layerRain"); on("layerClouds"); }
    else if (key === "snow") { on("layerSnow"); }
    else if (key === "thunder") { on("layerRain"); on("layerLightning"); }
    else if (key === "night") { on("layerStars"); }
  }

  /* ---------- Theme & units ---------- */
  function applyTheme() {
    el.html.setAttribute("data-theme", state.theme);
    el.themeBtn.textContent = state.theme === "dark" ? "☀" : "☾";
  }
  function applyUnits() {
    el.html.setAttribute("data-units", state.units);
    el.unitToggle.querySelector(".u-c").classList.toggle("active", state.units === "c");
    el.unitToggle.querySelector(".u-f").classList.toggle("active", state.units === "f");
  }

  /* ---------- Skeleton ---------- */
  function showSkeleton() {
    el.locName.textContent = "Loading…";
    el.tempBig.textContent = "—";
    el.heroQuick.innerHTML = Array(4).fill('<div class="quick skeleton" style="height:54px"></div>').join("");
    el.highlightsGrid.innerHTML = Array(8).fill('<div class="hcard glass skeleton" style="height:120px"></div>').join("");
    el.hourlyScroll.innerHTML = Array(8).fill('<div class="hour glass skeleton" style="height:130px"></div>').join("");
    el.dailyList.innerHTML = Array(7).fill('<div class="day-row skeleton" style="height:30px;border:none;margin:6px 0"></div>').join("");
  }

  /* ---------- Error / offline ---------- */
  function showError(msg) {
    el.errorBanner.hidden = false;
    el.errorBanner.textContent = "⚠ " + msg;
    setTimeout(() => { el.errorBanner.hidden = true; }, 5000);
  }
  function updateOnline() { el.offlineBanner.hidden = navigator.onLine; }

  /* ---------- Fetch ---------- */
  function isCoordinateQuery(q) {
    return /^-?\d+(\.\d+)?\s*,\s*-?\d+(\.\d+)?$/.test(q);
  }

  function toF(c) {
    return Math.round((c * 9) / 5 + 32);
  }

  function mapWeatherCode(code) {
    switch (Number(code)) {
      case 0: return 1000;
      case 1:
      case 2:
      case 3: return 1003;
      case 45:
      case 48: return 1030;
      case 51:
      case 53:
      case 55:
      case 61:
      case 63:
      case 65:
      case 80:
      case 81:
      case 82: return 1183;
      case 66:
      case 67:
      case 71:
      case 73:
      case 75:
      case 77:
      case 85:
      case 86: return 1255;
      case 95:
      case 96:
      case 99: return 1276;
      default: return 1003;
    }
  }

  function weatherText(code) {
    switch (Number(code)) {
      case 0: return "Clear";
      case 1:
      case 2:
      case 3: return "Partly cloudy";
      case 45:
      case 48: return "Fog";
      case 51:
      case 53:
      case 55:
      case 61:
      case 63:
      case 65:
      case 80:
      case 81:
      case 82: return "Rain";
      case 66:
      case 67:
      case 71:
      case 73:
      case 75:
      case 77:
      case 85:
      case 86: return "Snow";
      case 95:
      case 96:
      case 99: return "Thunderstorm";
      default: return "Cloudy";
    }
  }

  function windDirection(deg) {
    const dirs = ["N", "NE", "E", "SE", "S", "SW", "W", "NW"];
    return dirs[Math.round(deg / 45) % 8];
  }

  function formatTime(value) {
    const date = new Date(value);
    return date.toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
  }

  async function fetchLocation(query) {
    if (isCoordinateQuery(query)) {
      const [lat, lon] = query.split(",").map((v) => Number(v.trim()));
      const res = await fetch(`${OPEN_METEO_REVERSE}?latitude=${lat}&longitude=${lon}&language=en&format=json`);
      if (!res.ok) throw new Error("Unable to resolve your location right now.");
      const data = await res.json();
      const result = (data.results || [])[0];
      return {
        name: result?.name || "Current location",
        region: result?.admin1 || "",
        country: result?.country || "",
        lat,
        lon,
        timezone: result?.timezone || "UTC",
      };
    }

    const res = await fetch(`${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(query)}&count=1&language=en&format=json`);
    if (!res.ok) throw new Error("City not found. Try another search.");
    const data = await res.json();
    const result = (data.results || [])[0];
    if (!result) throw new Error("City not found. Try another search.");
    return {
      name: result.name,
      region: result.admin1 || "",
      country: result.country,
      lat: Number(result.latitude),
      lon: Number(result.longitude),
      timezone: result.timezone || "UTC",
    };
  }

  async function fetchForecast(query) {
    const location = await fetchLocation(query);
    const url = new URL(OPEN_METEO_FORECAST);
    url.searchParams.set("latitude", location.lat);
    url.searchParams.set("longitude", location.lon);
    url.searchParams.set("current", "temperature_2m,relative_humidity_2m,apparent_temperature,is_day,precipitation,weather_code,wind_speed_10m,wind_direction_10m,pressure_msl,visibility,uv_index");
    url.searchParams.set("hourly", "temperature_2m,apparent_temperature,precipitation_probability,weather_code,relative_humidity_2m,wind_speed_10m");
    url.searchParams.set("daily", "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max,uv_index_max,sunrise,sunset");
    url.searchParams.set("timezone", "auto");
    url.searchParams.set("forecast_days", "7");

    const res = await fetch(url);
    if (!res.ok) throw new Error("Weather data is unavailable right now.");
    const payload = await res.json();

    const current = payload.current || {};
    const hourly = payload.hourly || {};
    const daily = payload.daily || {};
    const hours = hourly.time || [];
    const startIndex = hours.findIndex((time) => new Date(time) >= new Date());
    const normalizedStart = startIndex >= 0 ? startIndex : 0;
    const next24Hours = hours.slice(normalizedStart, normalizedStart + 24).map((time, index) => {
      const hourCode = Number(hourly.weather_code?.[normalizedStart + index]);
      const hourTemp = Number(hourly.temperature_2m?.[normalizedStart + index]);
      const hourIsDay = Number(new Date(time).getHours()) >= 6 && Number(new Date(time).getHours()) < 20 ? 1 : 0;
      return {
        time,
        temp_c: hourTemp,
        temp_f: toF(hourTemp),
        condition: { code: mapWeatherCode(hourCode), text: weatherText(hourCode) },
        is_day: hourIsDay,
        chance_of_rain: Number(hourly.precipitation_probability?.[normalizedStart + index] || 0),
      };
    });

    const forecastday = (daily.time || []).slice(0, 7).map((date, idx) => {
      const dayHours = (hourly.time || []).reduce((acc, time, timeIdx) => {
        if (time.startsWith(date)) {
          const dayCode = Number(hourly.weather_code?.[timeIdx]);
          const dayTemp = Number(hourly.temperature_2m?.[timeIdx]);
          const isDay = Number(new Date(time).getHours()) >= 6 && Number(new Date(time).getHours()) < 20 ? 1 : 0;
          acc.push({
            time,
            temp_c: dayTemp,
            temp_f: toF(dayTemp),
            condition: { code: mapWeatherCode(dayCode), text: weatherText(dayCode) },
            is_day: isDay,
            chance_of_rain: Number(hourly.precipitation_probability?.[timeIdx] || 0),
          });
        }
        return acc;
      }, []);

      return {
        date,
        day: {
          condition: { code: mapWeatherCode(Number(daily.weather_code?.[idx])), text: weatherText(Number(daily.weather_code?.[idx])) },
          mintemp_c: Number(daily.temperature_2m_min?.[idx] || 0),
          mintemp_f: toF(Number(daily.temperature_2m_min?.[idx] || 0)),
          maxtemp_c: Number(daily.temperature_2m_max?.[idx] || 0),
          maxtemp_f: toF(Number(daily.temperature_2m_max?.[idx] || 0)),
          daily_chance_of_rain: Number(daily.precipitation_probability_max?.[idx] || 0),
        },
        astro: {
          sunrise: formatTime(daily.sunrise?.[idx] || new Date()),
          sunset: formatTime(daily.sunset?.[idx] || new Date()),
          moon_phase: "—",
          moon_illumination: "0",
        },
        hour: dayHours.length ? dayHours : next24Hours,
      };
    });

    return {
      location: {
        name: location.name,
        region: location.region,
        country: location.country,
        lat: location.lat,
        lon: location.lon,
        localtime: new Date().toISOString(),
      },
      current: {
        temp_c: Number(current.temperature_2m ?? 0),
        temp_f: toF(Number(current.temperature_2m ?? 0)),
        condition: { code: mapWeatherCode(Number(current.weather_code ?? 0)), text: weatherText(Number(current.weather_code ?? 0)) },
        feelslike_c: Number(current.apparent_temperature ?? current.temperature_2m ?? 0),
        feelslike_f: toF(Number(current.apparent_temperature ?? current.temperature_2m ?? 0)),
        humidity: Number(current.relative_humidity_2m ?? 0),
        wind_kph: Number(current.wind_speed_10m ?? 0),
        wind_mph: Math.round((Number(current.wind_speed_10m ?? 0) * 0.621371) * 10) / 10,
        wind_dir: windDirection(Number(current.wind_direction_10m ?? 0)),
        pressure_mb: Number(current.pressure_msl ?? 0),
        vis_km: Number(current.visibility ?? 0) / 1000,
        vis_miles: Math.round((Number(current.visibility ?? 0) / 1609.344) * 10) / 10,
        uv: Number(current.uv_index ?? 0),
        air_quality: {},
        is_day: Number(current.is_day ?? 1),
        precip_mm: Number(current.precipitation ?? 0),
      },
      forecast: { forecastday },
      alerts: { alert: [] },
    };
  }

  async function loadWeather(query) {
    if (!navigator.onLine && state.last) { render(state.last); return; }
    showSkeleton();
    try {
      const data = await fetchForecast(query);
      state.last = data;
      localStorage.setItem("lastData", JSON.stringify(data));
      addRecent(`${data.location.name}, ${data.location.country}`);
      render(data);
    } catch (err) {
      showError(err.message);
      if (state.last) render(state.last);
    }
  }

  /* ---------- Render ---------- */
  function render(d) {
    const loc = d.location, cur = d.current;
    const isDay = cur.is_day;
    document.title = `${round(cur.temp_c)}° ${cur.condition.text} — ${loc.name} | Auralis`;

    el.locName.textContent = loc.name;
    el.locMeta.textContent = `${loc.region ? loc.region + ", " : ""}${loc.country} · ${new Date(loc.localtime).toLocaleString([], { weekday: "long", hour: "2-digit", minute: "2-digit" })}`;
    el.heroIcon.textContent = emojiFor(cur.condition.code, isDay);
    el.tempBig.textContent = temp(cur.temp_c, cur.temp_f);
    el.tempCond.textContent = cur.condition.text;
    el.tempFeels.textContent = `Feels like ${tempUnit(cur.feelslike_c, cur.feelslike_f)}`;

    setScene(sceneFor(cur.condition.code, isDay));
    updateFavBtn();

    /* Quick stats */
    el.heroQuick.innerHTML = [
      { i: "💧", l: "Humidity", v: `${cur.humidity}%` },
      { i: "🌬️", l: "Wind", v: speed(cur.wind_kph, cur.wind_mph) },
      { i: "🌧️", l: "Rain", v: `${d.forecast.forecastday[0].day.daily_chance_of_rain}%` },
      { i: "☀️", l: "UV", v: cur.uv },
    ].map((q) => `<div class="quick"><span class="q-ico">${q.i}</span><div><div class="q-label">${q.l}</div><div class="q-val">${q.v}</div></div></div>`).join("");

    renderHighlights(d);
    renderHourly(d);
    renderDaily(d);
    renderMap(loc);
    renderAlerts(d);
  }

  function renderHighlights(d) {
    const cur = d.current, day = d.forecast.forecastday[0].day, astro = d.forecast.forecastday[0].astro;
    const aqi = cur.air_quality || {};
    const usEpa = aqi["us-epa-index"];
    const aqiText = ["", "Good", "Moderate", "Unhealthy (Sensitive)", "Unhealthy", "Very Unhealthy", "Hazardous"][usEpa] || "—";
    const cards = [
      { l: "Air Quality", i: "🫧", v: aqiText, sub: `PM2.5 ${aqi.pm2_5 ? aqi.pm2_5.toFixed(0) : "—"} µg/m³`, bar: usEpa ? (usEpa / 6) * 100 : 0 },
      { l: "UV Index", i: "☀️", v: cur.uv, sub: uvLabel(cur.uv), bar: Math.min(cur.uv / 11, 1) * 100 },
      { l: "Humidity", i: "💧", v: `${cur.humidity}%`, sub: cur.humidity > 70 ? "Humid" : "Comfortable", bar: cur.humidity },
      { l: "Wind", i: "🌬️", v: speed(cur.wind_kph, cur.wind_mph), sub: `${cur.wind_dir}`, bar: Math.min(cur.wind_kph / 60, 1) * 100 },
      { l: "Pressure", i: "📊", v: `${cur.pressure_mb}`, sub: "hPa", bar: Math.min(Math.max((cur.pressure_mb - 980) / 60, 0), 1) * 100 },
      { l: "Visibility", i: "👁️", v: state.units === "c" ? `${cur.vis_km} km` : `${cur.vis_miles} mi`, sub: cur.vis_km >= 10 ? "Clear" : "Reduced", bar: Math.min(cur.vis_km / 10, 1) * 100 },
      { l: "Sunrise / Sunset", i: "🌅", v: astro.sunrise, sub: `Sunset ${astro.sunset}`, bar: 50 },
      { l: "Moon Phase", i: "🌙", v: astro.moon_phase, sub: `Illum ${astro.moon_illumination}%`, bar: Number(astro.moon_illumination) || 0 },
    ];
    el.highlightsGrid.innerHTML = cards.map((c, idx) => `
      <div class="hcard glass" style="animation-delay:${idx * 0.05}s">
        <div class="h-top"><span class="h-label">${c.l}</span><span class="h-ico">${c.i}</span></div>
        <span class="h-val">${c.v}</span>
        <span class="h-sub">${c.sub}</span>
        <div class="h-bar"><span style="width:${c.bar}%"></span></div>
      </div>`).join("");
  }

  function uvLabel(uv) {
    if (uv <= 2) return "Low"; if (uv <= 5) return "Moderate"; if (uv <= 7) return "High"; if (uv <= 10) return "Very High"; return "Extreme";
  }

  function renderHourly(d) {
    const nowHour = new Date(d.location.localtime).getHours();
    let hours = [];
    d.forecast.forecastday.forEach((fd) => hours.push(...fd.hour));
    const start = hours.findIndex((h) => new Date(h.time).getHours() === nowHour && new Date(h.time).getDate() === new Date(d.location.localtime).getDate());
    const slice = hours.slice(start >= 0 ? start : 0, (start >= 0 ? start : 0) + 24);
    el.hourlyScroll.innerHTML = slice.map((h, i) => {
      const dt = new Date(h.time);
      const label = i === 0 ? "Now" : dt.toLocaleTimeString([], { hour: "numeric" });
      return `<div class="hour glass">
        <span class="h-time">${label}</span>
        <span class="h-emoji">${emojiFor(h.condition.code, h.is_day)}</span>
        <span class="h-temp">${temp(h.temp_c, h.temp_f)}</span>
        <span class="h-rain">💧${h.chance_of_rain}%</span>
      </div>`;
    }).join("");
  }

  function renderDaily(d) {
    el.dailyList.innerHTML = d.forecast.forecastday.map((fd, i) => {
      const dt = new Date(fd.date);
      const name = i === 0 ? "Today" : dt.toLocaleDateString([], { weekday: "short" });
      return `<div class="day-row">
        <span class="day-name">${name}</span>
        <span class="day-cond"><span class="d-emoji">${emojiFor(fd.day.condition.code, 1)}</span>💧${fd.day.daily_chance_of_rain}%</span>
        <span class="day-temps">
          <span class="d-min">${temp(fd.day.mintemp_c, fd.day.mintemp_f)}</span>
          <span class="range-bar"><span style="left:15%;right:15%"></span></span>
          <span class="d-max">${temp(fd.day.maxtemp_c, fd.day.maxtemp_f)}</span>
        </span>
      </div>`;
    }).join("");
  }

  function renderMap(loc) {
    const dl = 0.15;
    const bbox = `${loc.lon - dl}%2C${loc.lat - dl}%2C${loc.lon + dl}%2C${loc.lat + dl}`;
    el.mapFrame.src = `https://www.openstreetmap.org/export/embed.html?bbox=${bbox}&layer=mapnik&marker=${loc.lat}%2C${loc.lon}`;
  }

  function renderAlerts(d) {
    const alerts = (d.alerts && d.alerts.alert) || [];
    if (!alerts.length) { el.alertsSection.hidden = true; return; }
    el.alertsSection.hidden = false;
    el.alertsWrap.innerHTML = alerts.map((a) => `
      <div class="alert"><h3>⚠ ${a.event || a.headline || "Weather Alert"}</h3>
      <p>${a.desc ? a.desc.slice(0, 240) + (a.desc.length > 240 ? "…" : "") : a.headline || ""}</p></div>`).join("");
  }

  /* ---------- Recent & favorites ---------- */
  function addRecent(name) {
    state.recent = [name, ...state.recent.filter((r) => r !== name)].slice(0, 6);
    localStorage.setItem("recent", JSON.stringify(state.recent));
    renderRecent();
  }
  function renderRecent() {
    if (!state.recent.length) { el.recentList.innerHTML = '<li class="muted small">Search a city</li>'; return; }
    el.recentList.innerHTML = state.recent.map((r) => `<li class="item" data-q="${r}"><span>📍 ${r.split(",")[0]}</span></li>`).join("");
  }
  function renderFav() {
    if (!state.favorites.length) { el.favList.innerHTML = '<li class="muted small">No favorites yet</li>'; return; }
    el.favList.innerHTML = state.favorites.map((f) => `<li class="item" data-q="${f}"><span>⭐ ${f.split(",")[0]}</span><span class="rm" data-rm="${f}">✕</span></li>`).join("");
  }
  function updateFavBtn() {
    if (!state.last) return;
    const name = `${state.last.location.name}, ${state.last.location.country}`;
    const saved = state.favorites.includes(name);
    el.favBtn.classList.toggle("saved", saved);
    el.favBtn.textContent = saved ? "★ Saved" : "☆ Save";
    el.favBtn.setAttribute("aria-pressed", saved);
  }
  function toggleFav() {
    if (!state.last) return;
    const name = `${state.last.location.name}, ${state.last.location.country}`;
    if (state.favorites.includes(name)) state.favorites = state.favorites.filter((f) => f !== name);
    else state.favorites = [name, ...state.favorites].slice(0, 8);
    localStorage.setItem("favorites", JSON.stringify(state.favorites));
    renderFav(); updateFavBtn();
  }

  /* ---------- Search autocomplete ---------- */
  async function fetchSuggestions(q) {
    if (!q) return [];
    const url = isCoordinateQuery(q)
      ? `${OPEN_METEO_REVERSE}?latitude=${q.split(",")[0].trim()}&longitude=${q.split(",")[1].trim()}&language=en&format=json`
      : `${OPEN_METEO_GEOCODE}?name=${encodeURIComponent(q)}&count=6&language=en&format=json`;
    const res = await fetch(url);
    if (!res.ok) return [];
    const data = await res.json();
    const results = Array.isArray(data.results) ? data.results : [];
    return results.map((c) => ({
      name: c.name,
      country: c.country,
      region: c.admin1 || "",
      lat: Number(c.latitude),
      lon: Number(c.longitude),
      timezone: c.timezone || "UTC",
    }));
  }

  const doSuggest = debounce(async (q) => {
    if (q.length < 2) { el.suggest.classList.remove("show"); return; }
    try {
      const list = await fetchSuggestions(q);
      if (!Array.isArray(list) || !list.length) { el.suggest.classList.remove("show"); return; }
      el.suggest.innerHTML = list.slice(0, 6).map((c) => `<li data-q="${c.name}, ${c.country}">${c.name}${c.region ? ", " + c.region : ""}${c.country ? ", " + c.country : ""}</li>`).join("");
      el.suggest.classList.add("show");
    } catch { el.suggest.classList.remove("show"); }
  }, 250);

  /* ---------- Ripple effect ---------- */
  function ripple(e) {
    const btn = e.currentTarget;
    const r = document.createElement("span");
    r.className = "rip";
    const rect = btn.getBoundingClientRect();
    const size = Math.max(rect.width, rect.height);
    r.style.width = r.style.height = size + "px";
    r.style.left = e.clientX - rect.left - size / 2 + "px";
    r.style.top = e.clientY - rect.top - size / 2 + "px";
    btn.appendChild(r);
    setTimeout(() => r.remove(), 600);
  }

  /* ---------- Geolocation ---------- */
  function useLocation() {
    if (!navigator.geolocation) { showError("Geolocation not supported."); return; }
    el.locBtn.textContent = "…";
    navigator.geolocation.getCurrentPosition(
      (pos) => { el.locBtn.textContent = "⌖"; loadWeather(`${pos.coords.latitude},${pos.coords.longitude}`); },
      () => { el.locBtn.textContent = "⌖"; showError("Location permission denied."); loadWeather("London"); },
      { timeout: 10000 }
    );
  }

  /* ---------- Sidebar (mobile) ---------- */
  function toggleSidebar(open) {
    const isOpen = open ?? !el.sidebar.classList.contains("open");
    el.sidebar.classList.toggle("open", isOpen);
    el.scrim.hidden = !isOpen;
  }

  /* ---------- Events ---------- */
  function bind() {
    el.year.textContent = new Date().getFullYear();
    document.querySelectorAll(".ripple").forEach((b) => b.addEventListener("click", ripple));

    el.searchInput.addEventListener("input", (e) => doSuggest(e.target.value.trim()));
    el.searchForm.addEventListener("submit", (e) => {
      e.preventDefault();
      const q = el.searchInput.value.trim();
      if (q) { loadWeather(q); el.suggest.classList.remove("show"); el.searchInput.blur(); }
    });
    el.suggest.addEventListener("click", (e) => {
      const li = e.target.closest("li[data-q]");
      if (!li) return;
      el.searchInput.value = li.dataset.q;
      loadWeather(li.dataset.q);
      el.suggest.classList.remove("show");
    });
    document.addEventListener("click", (e) => { if (!el.searchForm.contains(e.target)) el.suggest.classList.remove("show"); });

    el.locBtn.addEventListener("click", useLocation);
    el.favBtn.addEventListener("click", toggleFav);
    el.unitToggle.addEventListener("click", () => {
      state.units = state.units === "c" ? "f" : "c";
      localStorage.setItem("units", state.units); applyUnits();
      if (state.last) render(state.last);
    });
    el.themeBtn.addEventListener("click", () => {
      state.theme = state.theme === "dark" ? "light" : "dark";
      localStorage.setItem("theme", state.theme); applyTheme();
    });

    el.menuBtn.addEventListener("click", () => toggleSidebar());
    el.scrim.addEventListener("click", () => toggleSidebar(false));

    const sideClick = (e) => {
      const li = e.target.closest("li[data-q]");
      const rm = e.target.closest("[data-rm]");
      if (rm) { e.stopPropagation(); state.favorites = state.favorites.filter((f) => f !== rm.dataset.rm); localStorage.setItem("favorites", JSON.stringify(state.favorites)); renderFav(); return; }
      if (li) { loadWeather(li.dataset.q); toggleSidebar(false); }
    };
    el.favList.addEventListener("click", sideClick);
    el.recentList.addEventListener("click", sideClick);

    window.addEventListener("online", updateOnline);
    window.addEventListener("offline", updateOnline);
    document.addEventListener("keydown", (e) => {
      if (e.key === "/" && document.activeElement !== el.searchInput) { e.preventDefault(); el.searchInput.focus(); }
      if (e.key === "Escape") { el.suggest.classList.remove("show"); toggleSidebar(false); }
    });
  }

  /* ---------- Init ---------- */
  function init() {
    applyTheme(); applyUnits(); renderRecent(); renderFav(); updateOnline(); bind();
    setScene("sunny");
    const cached = localStorage.getItem("lastData");
    if (cached) { try { state.last = JSON.parse(cached); render(state.last); } catch {} }
    // Try device location, fall back to a default city
    if (navigator.geolocation && !cached) useLocation();
    else if (!cached) loadWeather("London");
    else useLocation();
  }

  document.addEventListener("DOMContentLoaded", init);
})();