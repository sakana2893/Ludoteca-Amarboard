<script>
/* ===== CONFIG ===== */
const API_URL = "https://script.google.com/macros/s/AKfycbyoQBfaYvxQBTS_EnK1-IOlPjLoFT0sWn1jcHPuDg5t0nUkwrvKPY-x8Qg8ii5BmtLDYg/exec";

/* ===== STORAGE KEYS ===== */
const LS_TOKEN = "AB_TOKEN";
const LS_PROFILE = "AB_PROFILE";

/* ===== JSONP ===== */
function jsonp(url) {
  return new Promise((resolve, reject) => {
    const cb = "cb_" + Math.random().toString(36).slice(2);
    const s = document.createElement("script");
    const sep = url.includes("?") ? "&" : "?";
    s.src = url + sep + "callback=" + cb + "&_=" + Date.now();
    s.async = true;

    window[cb] = (data) => {
      cleanup();
      resolve(data);
    };

    s.onerror = () => {
      cleanup();
      reject(new Error("JSONP load error"));
    };

    function cleanup(){
      try { delete window[cb]; } catch(e){ window[cb] = undefined; }
      if (s.parentNode) s.parentNode.removeChild(s);
    }

    document.body.appendChild(s);
  });
}

function api(action, params={}) {
  const qs = new URLSearchParams({ action, ...params }).toString();
  return jsonp(`${API_URL}?${qs}`);
}

/* ===== AUTH HELPERS ===== */
function getToken(){ return localStorage.getItem(LS_TOKEN) || ""; }
function setSession(token, profile){
  localStorage.setItem(LS_TOKEN, token);
  localStorage.setItem(LS_PROFILE, JSON.stringify(profile||{}));
}
function clearSession(){
  localStorage.removeItem(LS_TOKEN);
  localStorage.removeItem(LS_PROFILE);
}
function getProfile(){
  try { return JSON.parse(localStorage.getItem(LS_PROFILE)||"{}"); } catch(e){ return {}; }
}

/* ===== SHA-256 (browser) ===== */
async function sha256Hex(text){
  const enc = new TextEncoder().encode(text);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  const arr = Array.from(new Uint8Array(buf));
  return arr.map(b => b.toString(16).padStart(2,"0")).join("");
}

/* ===== UI helpers ===== */
const E = (id)=>document.getElementById(id);
function show(el){ el.style.display=""; }
function hide(el){ el.style.display="none"; }

function badgeHtml(stato){
  const s = (stato||"").toLowerCase();
  if (s==="inviata") return `<span class="badge badge-prestato">📌 Richiesto</span>`;
  if (s==="approvata") return `<span class="badge badge-disponibile">✅ Prenotato</span>`;
  return "";
}

/* ===== RESERVATION STATUS CACHE ===== */
let reservationMap = {}; // titoloLower -> Stato

async function refreshReservationMap(titles){
  if (!titles.length) return;
  const joined = titles.join("|");
  const r = await api("reservations_status", { titoli: joined });
  if (r && r.ok) reservationMap = r.map || {};
}

/* ===== INDEX: apply badges + disable buttons ===== */
function applyBadgesAndButtons(){
  // Cerca elementi con data-title (li metti sul bottone “Richiedi”)
  const btns = document.querySelectorAll("[data-action='richiedi']");
  btns.forEach(btn=>{
    const titolo = (btn.getAttribute("data-title")||"").trim();
    const key = titolo.toLowerCase();
    const stato = reservationMap[key] || "";

    // badge container vicino al bottone
    const badgeBoxId = btn.getAttribute("data-badge-id");
    const badgeBox = badgeBoxId ? document.getElementById(badgeBoxId) : null;
    if (badgeBox) badgeBox.innerHTML = badgeHtml(stato);

    const blocked = (stato === "Inviata" || stato === "Approvata");
    btn.disabled = blocked;
    btn.style.opacity = blocked ? "0.55" : "1";
    btn.style.cursor = blocked ? "not-allowed" : "pointer";
  });
}

/* ===== LOGIN / LOGOUT ===== */
async function doLogin(username, password){
  const passhash = await sha256Hex(password);
  const r = await api("login", { username, passhash });
  if (!r.ok) throw new Error(r.error || "Login fallito");
  setSession(r.token, r.profile);
  return r.profile;
}

async function doLogout(){
  const token = getToken();
  if (token) {
    try { await api("logout", { token }); } catch(e){}
  }
  clearSession();
}

/* ===== ME ===== */
async function loadMe(){
  const token = getToken();
  if (!token) return { ok:false };
  const r = await api("me", { token });
  if (!r.ok) { clearSession(); return { ok:false, error:r.error }; }
  localStorage.setItem(LS_PROFILE, JSON.stringify(r.profile||{}));
  return r;
}

/* ===== SUBMIT REQUEST ===== */
async function submitRequest({titolo, giocatori, nome, telefono, note}){
  const token = getToken();
  const r = await api("submit_request", { token, titolo, giocatori, nome, telefono, note });
  if (!r.ok) throw new Error(r.error || "Errore invio");
  return r;
}

/* ===== AUTO REFRESH (index) ===== */
let AUTO_TIMER = null;
function startAutoRefresh(getTitlesFn, intervalMs=8000){
  if (AUTO_TIMER) clearInterval(AUTO_TIMER);
  AUTO_TIMER = setInterval(async ()=>{
    try{
      const titles = getTitlesFn();
      await refreshReservationMap(titles);
      applyBadgesAndButtons();
    }catch(e){
      // silenzioso: non rompere UX
    }
  }, intervalMs);
}
</script>
