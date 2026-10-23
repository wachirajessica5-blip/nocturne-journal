(() => {
  const config = window.NOCTURNE_CONFIG || {};
  const configured = config.supabaseUrl && config.supabaseAnonKey &&
    !config.supabaseUrl.includes("PASTE_") && !config.supabaseAnonKey.includes("PASTE_");
  const $ = (id) => document.getElementById(id);
  const authView = $("authView"), journalView = $("journalView");
  let supabase = null, mode = "login", entries = [], editingId = null;

  function message(id, text, error = false) {
    const el = $(id); el.textContent = text; el.classList.toggle("error", error);
  }
  function today() {
    const d = new Date();
    return `${d.getFullYear()}-${String(d.getMonth()+1).padStart(2,"0")}-${String(d.getDate()).padStart(2,"0")}`;
  }
  function prettyDate(value) {
    if (!value) return "";
    const d = new Date(`${value}T12:00:00`);
    return d.toLocaleDateString(undefined, {year:"numeric", month:"long", day:"numeric"});
  }
  function showAuth() { authView.classList.remove("hidden"); journalView.classList.add("hidden"); $("accountArea").classList.add("hidden"); }
  function showJournal(user) {
    authView.classList.add("hidden"); journalView.classList.remove("hidden"); $("accountArea").classList.remove("hidden");
    $("userEmail").textContent = user.email || "Your journal";
    $("todayLabel").textContent = new Date().toLocaleDateString(undefined,{weekday:"long",year:"numeric",month:"long",day:"numeric"});
    loadEntries();
  }
  function setMode(next) {
    mode = next;
    $("loginTab").classList.toggle("active", mode === "login");
    $("signupTab").classList.toggle("active", mode === "signup");
    $("authSubmit").textContent = mode === "login" ? "Enter your journal" : "Create my account";
    $("password").autocomplete = mode === "login" ? "current-password" : "new-password";
    message("authMessage", "");
  }
  $("loginTab").addEventListener("click", () => setMode("login"));
  $("signupTab").addEventListener("click", () => setMode("signup"));

  if (!configured || !window.supabase) {
    $("setupNotice").classList.remove("hidden");
    $("authSubmit").disabled = true;
    $("authSubmit").textContent = "Finish setup first";
    message("authMessage", "The app needs its Supabase settings before you can sign in.", true);
    return;
  }

  supabase = window.supabase.createClient(config.supabaseUrl, config.supabaseAnonKey);

  $("authForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const email = $("email").value.trim(), password = $("password").value;
    $("authSubmit").disabled = true;
    message("authMessage", mode === "login" ? "Signing in…" : "Creating your account…");
    try {
      if (mode === "signup") {
        const {data, error} = await supabase.auth.signUp({email, password});
        if (error) throw error;
        if (data.session) showJournal(data.user);
        else message("authMessage", "Account created! Check your email for a confirmation link, then come back and sign in.");
      } else {
        const {data, error} = await supabase.auth.signInWithPassword({email, password});
        if (error) throw error;
        showJournal(data.user);
      }
    } catch (e) { message("authMessage", e.message || "Something went wrong. Please try again.", true); }
    finally { $("authSubmit").disabled = false; }
  });

  $("signOutBtn").addEventListener("click", async () => {
    await supabase.auth.signOut();
    entries = []; closeEditor(); showAuth(); message("authMessage", "You've signed out.");
  });

  function openEditor(entry = null) {
    editingId = entry ? entry.id : null;
    $("editorHeading").textContent = entry ? "Edit this page" : "A new page";
    $("entryTitle").value = entry?.title || "";
    $("entryDate").value = entry?.entry_date || today();
    $("entryMood").value = entry?.mood || "🌙 Calm";
    $("entryBody").value = entry?.body || "";
    message("entryMessage", "");
    $("saveEntryBtn").textContent = entry ? "Update entry" : "Save entry";
    $("editor").classList.remove("hidden");
    $("editor").scrollIntoView({behavior:"smooth",block:"start"});
    $("entryTitle").focus();
  }
  function closeEditor() { $("editor").classList.add("hidden"); $("entryForm").reset(); editingId = null; }
  $("newEntryBtn").addEventListener("click", () => openEditor());
  $("emptyNewEntryBtn").addEventListener("click", () => openEditor());
  $("cancelEditBtn").addEventListener("click", closeEditor);

  $("entryForm").addEventListener("submit", async (event) => {
    event.preventDefault();
    const {data:{user}} = await supabase.auth.getUser();
    if (!user) { message("entryMessage", "Please sign in again.", true); return; }
    const payload = {
      user_id: user.id,
      title: $("entryTitle").value.trim(),
      entry_date: $("entryDate").value,
      mood: $("entryMood").value,
      body: $("entryBody").value.trim()
    };
    $("saveEntryBtn").disabled = true;
    message("entryMessage", "Saving your page…");
    try {
      let result;
      if (editingId) result = await supabase.from("journal_entries").update(payload).eq("id", editingId).select().single();
      else result = await supabase.from("journal_entries").insert(payload).select().single();
      if (result.error) throw result.error;
      closeEditor();
      await loadEntries();
    } catch (e) {
      message("entryMessage", e.message || "Couldn't save this entry. Please try again.", true);
    } finally { $("saveEntryBtn").disabled = false; }
  });

  async function loadEntries() {
    $("loadingState").classList.remove("hidden");
    $("emptyState").classList.add("hidden");
    try {
      const {data, error} = await supabase.from("journal_entries")
        .select("id,title,entry_date,mood,body,created_at,updated_at")
        .order("entry_date",{ascending:false}).order("created_at",{ascending:false});
      if (error) throw error;
      entries = data || [];
      renderEntries();
    } catch (e) {
      $("entriesList").innerHTML = "";
      $("loadingState").textContent = "Couldn't load entries: " + (e.message || "Please refresh and try again.");
      $("loadingState").classList.remove("hidden");
      return;
    }
    $("loadingState").classList.add("hidden");
  }

  function renderEntries() {
    const term = $("searchInput").value.trim().toLowerCase();
    const mood = $("moodFilter").value;
    const filtered = entries.filter(e =>
      (!mood || e.mood === mood) &&
      (!term || `${e.title} ${e.body} ${e.mood} ${e.entry_date}`.toLowerCase().includes(term))
    );
    $("entryCount").textContent = `${filtered.length} ${filtered.length === 1 ? "entry" : "entries"}`;
    $("entriesList").innerHTML = "";
    $("emptyState").classList.toggle("hidden", filtered.length !== 0);
    if (!filtered.length) {
      $("emptyState").querySelector("h3").textContent = entries.length ? "No matching pages." : "Your story starts here.";
      $("emptyState").querySelector("p").textContent = entries.length ? "Try another search or mood filter." : "No entries yet. Make your first page whenever you're ready.";
      $("emptyNewEntryBtn").classList.toggle("hidden", entries.length > 0);
      return;
    }
    for (const entry of filtered) {
      const card = document.createElement("article"); card.className = "entry-card";
      const meta = document.createElement("div"); meta.className = "entry-meta";
      const date = document.createElement("span"); date.textContent = prettyDate(entry.entry_date);
      const moodLabel = document.createElement("span"); moodLabel.textContent = entry.mood || "🌙 Calm";
      meta.append(date, moodLabel);
      const title = document.createElement("h3"); title.textContent = entry.title;
      const preview = document.createElement("p"); preview.className = "entry-preview"; preview.textContent = entry.body;
      const actions = document.createElement("div"); actions.className = "entry-card-actions";
      const edit = document.createElement("button"); edit.className = "quiet-button"; edit.type = "button"; edit.textContent = "Edit";
      edit.addEventListener("click", () => openEditor(entry));
      const del = document.createElement("button"); del.className = "quiet-button"; del.type = "button"; del.textContent = "Delete";
      del.addEventListener("click", async () => {
        if (!confirm(`Delete "${entry.title}"? This cannot be undone.`)) return;
        del.disabled = true;
        const {error} = await supabase.from("journal_entries").delete().eq("id", entry.id);
        if (error) { alert("Couldn't delete this entry: " + error.message); del.disabled = false; }
        else await loadEntries();
      });
      actions.append(edit,del); card.append(meta,title,preview,actions); $("entriesList").append(card);
    }
  }
  $("searchInput").addEventListener("input", renderEntries);
  $("moodFilter").addEventListener("change", renderEntries);

  $("exportBtn").addEventListener("click", () => {
    const blob = new Blob([JSON.stringify({exported_at:new Date().toISOString(),app:"NOCTURNE Journal",entries},null,2)],{type:"application/json"});
    const url = URL.createObjectURL(blob), a = document.createElement("a");
    a.href = url; a.download = `nocturne-journal-backup-${today()}.json`; a.click(); URL.revokeObjectURL(url);
  });

  supabase.auth.onAuthStateChange((event, session) => {
    if (session?.user) showJournal(session.user);
    else if (event === "SIGNED_OUT") showAuth();
  });
  supabase.auth.getSession().then(({data:{session}}) => {
    if (session?.user) showJournal(session.user);
    else showAuth();
  });

  if ("serviceWorker" in navigator && location.protocol.startsWith("http")) {
    window.addEventListener("load", () => navigator.serviceWorker.register("./sw.js").catch(() => {}));
  }
})();
