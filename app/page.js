"use client";

import { useEffect, useMemo, useState, useCallback } from "react";
import { supabase } from "@/lib/supabase";
import {
  EVENT_TYPES,
  typeById,
  MO,
  DOW,
  parseDate,
  ymd,
  todayYMD,
  formatTime,
  initials,
  suggestPassword,
  resizeImage,
} from "@/lib/util";

/* ================================================================== */
/* Helpers                                                             */
/* ================================================================== */
function Avatar({ member, size }) {
  const cls = "av" + (size ? " " + size : "");
  if (!member) return <span className={cls}>?</span>;
  if (member.photo_url) {
    return (
      <span className={cls}>
        <img src={member.photo_url} alt={member.name || ""} />
      </span>
    );
  }
  return <span className={cls}>{initials(member.name)}</span>;
}

function Splash({ label }) {
  return (
    <main>
      <div className="empty" style={{ marginTop: 60 }}>
        <div className="big">{label || "Loading…"}</div>
      </div>
    </main>
  );
}

async function uploadImage(bucket, folder, blob, ext) {
  const path = `${folder}/${Date.now()}.${ext}`;
  const { error } = await supabase.storage
    .from(bucket)
    .upload(path, blob, { contentType: blob.type, upsert: true });
  if (error) throw error;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl;
}

function relTime(iso) {
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return Math.floor(diff / 60) + "m ago";
  if (diff < 86400) return Math.floor(diff / 3600) + "h ago";
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* ================================================================== */
/* Auth screen (sign in only — accounts are invite-only)              */
/* ================================================================== */
function AuthScreen() {
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!email.trim() || !password) {
      setErr("Enter your email and password.");
      return;
    }
    setBusy(true);
    try {
      const { error } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });
      if (error) throw error;
    } catch (e) {
      setErr(e.message || "Couldn't sign in. Check your email and password.");
      setBusy(false);
    }
  }

  return (
    <div className="auth-wrap">
      <div className="auth-card">
        <div className="logo-badge">
          <img src="/jh-logo.webp" alt="Jurupa Hills High School logo" />
        </div>
        <h1>
          ASB <em>Class of &apos;27</em>
        </h1>
        <div className="subline">Class of 2027 HQ.</div>

        <label className="fld">
          <span>Email</span>
          <input
            type="email"
            value={email}
            placeholder="you@example.com"
            onChange={(e) => setEmail(e.target.value)}
          />
        </label>
        <label className="fld">
          <span>Password</span>
          <input
            type="password"
            value={password}
            placeholder="••••••••"
            onChange={(e) => setPassword(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") submit();
            }}
          />
        </label>
        {err && <div className="err">{err}</div>}
        <button
          className="btn primary"
          style={{ width: "100%", justifyContent: "center", marginTop: 6 }}
          onClick={submit}
          disabled={busy}
        >
          {busy ? "Signing in…" : "Sign in"}
        </button>
        <div className="auth-toggle">Accounts are invite-only.</div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Main                                                                */
/* ================================================================== */
export default function Page() {
  const [session, setSession] = useState(undefined);
  const [me, setMe] = useState(null);
  const [ready, setReady] = useState(false);

  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);
  const [jobs, setJobs] = useState([]);
  const [shopping, setShopping] = useState([]);
  const [banner, setBanner] = useState({ banner_text: "", banner_enabled: false });

  const [view, setView] = useState("home");
  const [calCursor, setCalCursor] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg) => setToastMsg(msg), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 1900);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // ---- auth ----
  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(data.session ?? null));
    const { data: sub } = supabase.auth.onAuthStateChange((_e, s) => setSession(s ?? null));
    return () => sub.subscription.unsubscribe();
  }, []);

  const loadAll = useCallback(async () => {
    const [mem, ev, asg, jb, jm, jn, si, sc, st] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: true }),
      supabase.from("events").select("*").order("date", { ascending: true }),
      supabase.from("assignments").select("*"),
      supabase.from("jobs").select("*").order("created_at", { ascending: false }),
      supabase.from("job_members").select("*"),
      supabase.from("job_notes").select("*").order("created_at", { ascending: true }),
      supabase.from("shopping_items").select("*").order("created_at", { ascending: true }),
      supabase.from("shopping_claims").select("*"),
      supabase.from("settings").select("*").eq("id", 1).maybeSingle(),
    ]);

    const membersData = mem.data || [];

    const evByEvent = {};
    (asg.data || []).forEach((a) => {
      (evByEvent[a.event_id] || (evByEvent[a.event_id] = [])).push(a.member_id);
    });
    const eventsData = (ev.data || []).map((e) => ({ ...e, members: evByEvent[e.id] || [] }));

    const jmByJob = {};
    (jm.data || []).forEach((r) => {
      (jmByJob[r.job_id] || (jmByJob[r.job_id] = [])).push(r.member_id);
    });
    const notesByJob = {};
    (jn.data || []).forEach((n) => {
      (notesByJob[n.job_id] || (notesByJob[n.job_id] = [])).push(n);
    });
    const jobsData = (jb.data || []).map((j) => ({
      ...j,
      members: jmByJob[j.id] || [],
      notes: notesByJob[j.id] || [],
    }));

    const claimByItem = {};
    (sc.data || []).forEach((c) => {
      claimByItem[c.item_id] = c;
    });
    const shoppingData = (si.data || []).map((it) => ({ ...it, claim: claimByItem[it.id] || null }));

    return {
      members: membersData,
      events: eventsData,
      jobs: jobsData,
      shopping: shoppingData,
      banner: st.data || { banner_text: "", banner_enabled: false },
    };
  }, []);

  const applyData = useCallback(
    (d) => {
      setMembers(d.members);
      setEvents(d.events);
      setJobs(d.jobs);
      setShopping(d.shopping);
      setBanner(d.banner);
    },
    []
  );

  const boot = useCallback(async () => {
    const d = await loadAll();
    applyData(d);
    let mine = d.members.find((m) => m.auth_user_id === session.user.id);
    if (!mine) {
      const fallbackName =
        session.user.user_metadata?.name || session.user.email.split("@")[0];
      await supabase
        .from("members")
        .insert({ auth_user_id: session.user.id, name: fallbackName, email: session.user.email })
        .then(() => {});
      const again = await loadAll();
      applyData(again);
      mine = again.members.find((m) => m.auth_user_id === session.user.id) || null;
    }
    setMe(mine);
  }, [loadAll, applyData, session]);

  useEffect(() => {
    if (session === undefined) return;
    if (session === null) {
      setMe(null);
      setReady(true);
      return;
    }
    let live = true;
    (async () => {
      setReady(false);
      await boot();
      if (live) setReady(true);
    })();
    return () => {
      live = false;
    };
  }, [session, boot]);

  const reload = useCallback(async () => {
    const d = await loadAll();
    applyData(d);
    if (session) {
      const mine = d.members.find((m) => m.auth_user_id === session.user.id);
      if (mine) setMe(mine);
    }
  }, [loadAll, applyData, session]);

  const onSaved = useCallback(
    async (msg) => {
      await reload();
      setModal(null);
      if (msg) showToast(msg);
    },
    [reload, showToast]
  );

  const callAdmin = useCallback(async (op, data) => {
    const { data: sess } = await supabase.auth.getSession();
    const token = sess?.session?.access_token || "";
    const res = await fetch("/api/admin", {
      method: "POST",
      headers: { "Content-Type": "application/json", Authorization: "Bearer " + token },
      body: JSON.stringify({ op, data }),
    });
    const j = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(j.error || "Request failed");
    return j;
  }, []);

  const memberById = useCallback((id) => members.find((m) => m.id === id), [members]);
  const isAdmin = !!me?.is_admin;

  const sortedEvents = useMemo(
    () =>
      [...events].sort((a, b) =>
        (a.date + (a.time || "")).localeCompare(b.date + (b.time || ""))
      ),
    [events]
  );
  const upcoming = useMemo(() => {
    const t = todayYMD();
    return sortedEvents.filter((e) => e.date >= t);
  }, [sortedEvents]);
  const memberUpcoming = useCallback(
    (id) => upcoming.filter((e) => (e.members || []).includes(id)),
    [upcoming]
  );

  // ---- shopping claim actions ----
  const claimItem = useCallback(
    async (item) => {
      try {
        const { error } = await supabase
          .from("shopping_claims")
          .insert({ item_id: item.id, member_id: me.id });
        if (error) throw error;
        await reload();
        showToast("You're bringing it ✦");
      } catch (e) {
        showToast(e.message || "Couldn't claim that");
      }
    },
    [me, reload, showToast]
  );
  const unclaimItem = useCallback(
    async (item) => {
      try {
        await supabase
          .from("shopping_claims")
          .delete()
          .eq("item_id", item.id)
          .eq("member_id", me.id);
        await reload();
      } catch (e) {
        showToast(e.message || "Couldn't update");
      }
    },
    [me, reload, showToast]
  );
  const adminClearClaim = useCallback(
    async (item) => {
      try {
        await supabase.from("shopping_claims").delete().eq("item_id", item.id);
        await reload();
      } catch (e) {
        showToast(e.message || "Couldn't update");
      }
    },
    [reload, showToast]
  );

  // ---- job note actions (keep modal open) ----
  const addJobNote = useCallback(
    async (jobId, body) => {
      const { error } = await supabase
        .from("job_notes")
        .insert({ job_id: jobId, author_member_id: me.id, body });
      if (error) throw error;
      await reload();
    },
    [me, reload]
  );
  const deleteJobNote = useCallback(
    async (noteId) => {
      await supabase.from("job_notes").delete().eq("id", noteId);
      await reload();
    },
    [reload]
  );

  async function logout() {
    await supabase.auth.signOut();
    setView("home");
    showToast("Signed out");
  }

  if (!ready) return <Splash />;
  if (!session) return <AuthScreen />;
  if (!me) return <Splash label="Setting up your profile…" />;

  const currentJob = modal?.kind === "jobDetail" ? jobs.find((j) => j.id === modal.id) : null;

  return (
    <>
      <header className="hero">
        <div className="hero-inner">
          <div className="logo-badge">
            <img src="/jh-logo.webp" alt="Jurupa Hills High School logo" />
          </div>
          <div className="hero-titles">
            <div className="eyebrow">
              <span className="pennant" /> Jurupa Hills · Associated Student Body
            </div>
            <h1 className="wordmark">
              ASB <em>Class of &apos;27</em>
            </h1>
            <div className="subline">Shared HQ for events, shifts, and the crew that runs them.</div>
          </div>
          <div className="hero-actions">
            {isAdmin && (
              <span className="officer-flag">
                <span className="pennant" /> Admin
              </span>
            )}
            <button
              className="btn ghost small"
              onClick={() => setModal({ kind: "memberEditor", member: me })}
            >
              Edit my profile
            </button>
            <button className="btn ghost small" onClick={logout}>
              Log out
            </button>
          </div>
        </div>
      </header>

      <nav className="tabs">
        <div className="tabs-inner">
          {[
            ["home", "Home"],
            ["calendar", "Calendar"],
            ["events", "Events"],
            ["roster", "Roster"],
            ["jobs", "Jobs"],
            ["shopping", "Shopping"],
          ].map(([id, label]) => (
            <button
              key={id}
              className="tab"
              role="tab"
              aria-selected={view === id}
              onClick={() => setView(id)}
            >
              {label}
              {id === "events" && <span className="cnt">{upcoming.length}</span>}
              {id === "roster" && <span className="cnt">{members.length}</span>}
            </button>
          ))}
        </div>
      </nav>

      {banner.banner_enabled && (banner.banner_text || isAdmin) && (
        <div className="banner">
          <div className="banner-inner">
            <span className="mega">📣</span>
            <span className="btext">
              {banner.banner_text || (isAdmin ? "No banner text yet — add one." : "")}
            </span>
            {isAdmin && (
              <button className="btn ghost small edit-b" onClick={() => setModal({ kind: "banner" })}>
                Edit
              </button>
            )}
          </div>
        </div>
      )}

      <main>
        {view === "home" && (
          <HomeView
            me={me}
            isAdmin={isAdmin}
            myEvents={memberUpcoming(me.id)}
            myJobs={jobs.filter((j) => (j.members || []).includes(me.id))}
            myItems={shopping.filter((it) => it.claim && it.claim.member_id === me.id)}
            onOpenEvent={(id) => setModal({ kind: "eventDetail", id })}
            onOpenJob={(id) => setModal({ kind: "jobDetail", id })}
            goShopping={() => setView("shopping")}
          />
        )}
        {view === "calendar" && (
          <CalendarView
            cursor={calCursor}
            setCursor={setCalCursor}
            sortedEvents={sortedEvents}
            onDay={(ds) => setModal({ kind: "day", date: ds })}
            onEvent={(id) => setModal({ kind: "eventDetail", id })}
          />
        )}
        {view === "events" && (
          <EventsView
            upcoming={upcoming}
            isAdmin={isAdmin}
            memberById={memberById}
            onAdd={() => setModal({ kind: "eventEditor", event: null })}
            onOpen={(id) => setModal({ kind: "eventDetail", id })}
            onEdit={(ev) => setModal({ kind: "eventEditor", event: ev })}
          />
        )}
        {view === "roster" && (
          <RosterView
            members={members}
            me={me}
            isAdmin={isAdmin}
            memberUpcoming={memberUpcoming}
            onInvite={() => setModal({ kind: "invite" })}
            onOpen={(id) => setModal({ kind: "memberDetail", id })}
          />
        )}
        {view === "jobs" && (
          <JobsView
            jobs={jobs}
            isAdmin={isAdmin}
            memberById={memberById}
            onAdd={() => setModal({ kind: "jobEditor", job: null })}
            onOpen={(id) => setModal({ kind: "jobDetail", id })}
          />
        )}
        {view === "shopping" && (
          <ShoppingView
            shopping={shopping}
            me={me}
            isAdmin={isAdmin}
            memberById={memberById}
            onClaim={claimItem}
            onUnclaim={unclaimItem}
            onClear={adminClearClaim}
            onAdd={() => setModal({ kind: "shopEditor", item: null })}
            onEdit={(it) => setModal({ kind: "shopEditor", item: it })}
          />
        )}
      </main>

      <footer>Class of 2027 · Jurupa Hills High School · Built by Dylan.</footer>

      {/* modals */}
      {modal?.kind === "eventEditor" && (
        <EventEditor
          event={modal.event}
          prefillDate={modal.prefillDate}
          members={members}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === "eventDetail" && (
        <EventDetail
          event={events.find((e) => e.id === modal.id)}
          isAdmin={isAdmin}
          memberById={memberById}
          onClose={() => setModal(null)}
          onEdit={(ev) => setModal({ kind: "eventEditor", event: ev })}
          onOpenMember={(id) => setModal({ kind: "memberDetail", id })}
        />
      )}
      {modal?.kind === "day" && (
        <DayModal
          date={modal.date}
          sortedEvents={sortedEvents}
          isAdmin={isAdmin}
          memberById={memberById}
          onClose={() => setModal(null)}
          onOpenEvent={(id) => setModal({ kind: "eventDetail", id })}
          onAdd={(ds) => setModal({ kind: "eventEditor", event: null, prefillDate: ds })}
        />
      )}
      {modal?.kind === "memberDetail" && (
        <MemberDetail
          member={memberById(modal.id)}
          me={me}
          isAdmin={isAdmin}
          memberUpcoming={memberUpcoming}
          onClose={() => setModal(null)}
          onEdit={(m) => setModal({ kind: "memberEditor", member: m })}
          onOpenEvent={(id) => setModal({ kind: "eventDetail", id })}
        />
      )}
      {modal?.kind === "memberEditor" && (
        <MemberEditor
          member={modal.member}
          me={me}
          isAdmin={isAdmin}
          callAdmin={callAdmin}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === "invite" && (
        <InviteModal callAdmin={callAdmin} onClose={() => setModal(null)} onDone={reload} />
      )}
      {modal?.kind === "banner" && (
        <BannerEditor banner={banner} onClose={() => setModal(null)} onSaved={onSaved} />
      )}
      {modal?.kind === "jobEditor" && (
        <JobEditor
          job={modal.job}
          members={members}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === "jobDetail" && (
        <JobDetail
          job={currentJob}
          me={me}
          isAdmin={isAdmin}
          memberById={memberById}
          onClose={() => setModal(null)}
          onEdit={(j) => setModal({ kind: "jobEditor", job: j })}
          onAddNote={addJobNote}
          onDeleteNote={deleteJobNote}
          onOpenMember={(id) => setModal({ kind: "memberDetail", id })}
        />
      )}
      {modal?.kind === "shopEditor" && (
        <ShopEditor item={modal.item} onClose={() => setModal(null)} onSaved={onSaved} />
      )}

      <div className={"toast" + (toastMsg ? " show" : "")}>{toastMsg}</div>
    </>
  );
}

/* ================================================================== */
/* Home                                                                */
/* ================================================================== */
function HomeView({ me, isAdmin, myEvents, myJobs, myItems, onOpenEvent, onOpenJob, goShopping }) {
  const nothing = myEvents.length === 0 && myJobs.length === 0 && myItems.length === 0;
  return (
    <div>
      <div className="greeting">
        <span className="wave">👋</span>
        <h2>Hi, {me.name.split(" ")[0]}</h2>
      </div>

      <div className="home-section">
        <div className="htitle">
          <span className="pennant" /> Here&apos;s what&apos;s on you
        </div>
        {nothing ? (
          <div className="mini-empty">
            You&apos;re all clear right now — nothing assigned yet. Check the Calendar and Jobs tabs to
            see what&apos;s coming up.
          </div>
        ) : null}
      </div>

      {myEvents.length > 0 && (
        <div className="home-section">
          <div className="htitle">Your upcoming events</div>
          <div className="stack">
            {myEvents.map((e) => {
              const t = typeById(e.type);
              const dt = parseDate(e.date);
              return (
                <div
                  className="ecard"
                  key={e.id}
                  role="button"
                  tabIndex={0}
                  onClick={() => onOpenEvent(e.id)}
                  onKeyDown={(ev) => {
                    if (ev.key === "Enter") onOpenEvent(e.id);
                  }}
                >
                  <div className="datebox">
                    <div className="mo">{MO[dt.getMonth()]}</div>
                    <div className="dd">{dt.getDate()}</div>
                    <div className="dow2">{DOW[dt.getDay()]}</div>
                  </div>
                  <div className="cbody">
                    <h3>{e.title}</h3>
                    <div className="meta">
                      <span className="type-tag" style={{ background: t.color }}>
                        {t.label}
                      </span>
                      {e.time && <span>🕒 {formatTime(e.time)}</span>}
                      {e.location && <span>📍 {e.location}</span>}
                    </div>
                  </div>
                </div>
              );
            })}
          </div>
        </div>
      )}

      {myJobs.length > 0 && (
        <div className="home-section">
          <div className="htitle">Your jobs</div>
          <div className="jobs-grid">
            {myJobs.map((j) => (
              <JobCardMini key={j.id} job={j} onOpen={() => onOpenJob(j.id)} />
            ))}
          </div>
        </div>
      )}

      {myItems.length > 0 && (
        <div className="home-section">
          <div className="htitle">You&apos;re bringing</div>
          <div className="shop-list">
            {myItems.map((it) => (
              <div className="sitem mine" key={it.id}>
                <div className="sinfo">
                  <div className="sname">{it.name}</div>
                  {(it.qty || it.category) && (
                    <div className="sqty">
                      {it.qty}
                      {it.qty && it.category ? " · " : ""}
                      {it.category}
                    </div>
                  )}
                </div>
                <button className="btn ghost small" onClick={goShopping}>
                  View list
                </button>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

function JobCardMini({ job, onOpen }) {
  return (
    <div className="jcard" role="button" tabIndex={0} onClick={onOpen} onKeyDown={(e) => { if (e.key === "Enter") onOpen(); }}>
      <div className="thumb">
        {job.image_url ? <img src={job.image_url} alt="" /> : <span className="ph">{initials(job.title)}</span>}
      </div>
      <div className="jbody">
        <div className="jname">{job.title}</div>
        <div className="jmeta">{(job.notes && job.notes.length) ? "Has notes" : "Tap to open"}</div>
      </div>
    </div>
  );
}

/* ================================================================== */
/* Calendar                                                            */
/* ================================================================== */
function CalendarView({ cursor, setCursor, sortedEvents, onDay, onEvent }) {
  const y = cursor.getFullYear();
  const m = cursor.getMonth();
  const first = new Date(y, m, 1);
  const startPad = first.getDay();
  const daysInMonth = new Date(y, m + 1, 0).getDate();
  const prevDays = new Date(y, m, 0).getDate();

  const cells = [];
  for (let i = startPad - 1; i >= 0; i--)
    cells.push({ d: prevDays - i, out: true, dt: new Date(y, m - 1, prevDays - i) });
  for (let d = 1; d <= daysInMonth; d++) cells.push({ d, out: false, dt: new Date(y, m, d) });
  while (cells.length % 7 !== 0) {
    const n = cells.length - (startPad + daysInMonth) + 1;
    cells.push({ d: n, out: true, dt: new Date(y, m + 1, n) });
  }
  const tstr = todayYMD();

  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> Calendar
        </h2>
      </div>
      <div className="cal-bar">
        <div className="cal-title">
          {MO[m]} {y}
        </div>
        <div className="cal-nav">
          <button className="icon-btn" aria-label="Previous month" onClick={() => setCursor(new Date(y, m - 1, 1))}>
            ‹
          </button>
          <button className="btn ghost small" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <button className="icon-btn" aria-label="Next month" onClick={() => setCursor(new Date(y, m + 1, 1))}>
            ›
          </button>
        </div>
      </div>
      <div className="cal-grid">
        {DOW.map((d) => (
          <div className="dow" key={d}>
            {d}
          </div>
        ))}
        {cells.map((c, i) => {
          const ds = ymd(c.dt);
          const dayEvents = c.out ? [] : sortedEvents.filter((e) => e.date === ds);
          const classes = "day" + (c.out ? " out" : "") + (ds === tstr ? " today" : "");
          return (
            <div
              className={classes}
              key={i}
              onClick={c.out ? undefined : () => onDay(ds)}
              role={c.out ? undefined : "button"}
              tabIndex={c.out ? undefined : 0}
              onKeyDown={
                c.out
                  ? undefined
                  : (e) => {
                      if (e.key === "Enter" || e.key === " ") {
                        e.preventDefault();
                        onDay(ds);
                      }
                    }
              }
            >
              <div className="dnum">{c.d}</div>
              {!c.out && (
                <>
                  <div className="day-dots">
                    {dayEvents.slice(0, 4).map((e) => (
                      <span className="dot" key={e.id} style={{ background: typeById(e.type).color }} />
                    ))}
                  </div>
                  {dayEvents.slice(0, 3).map((e) => (
                    <button
                      className="chip"
                      key={e.id}
                      style={{ background: typeById(e.type).color }}
                      onClick={(ev) => {
                        ev.stopPropagation();
                        onEvent(e.id);
                      }}
                    >
                      {e.title}
                    </button>
                  ))}
                  {dayEvents.length > 3 && <div className="more-tag">+{dayEvents.length - 3} more</div>}
                </>
              )}
            </div>
          );
        })}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {EVENT_TYPES.map((t) => (
          <span key={t.id} style={{ fontSize: 12.5, color: "var(--ink-soft)", display: "inline-flex", alignItems: "center" }}>
            <span className="dot" style={{ display: "inline-block", background: t.color, marginRight: 6 }} />
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Events                                                              */
/* ================================================================== */
function EventCard({ event, memberById, isAdmin, onOpen, onEdit }) {
  const t = typeById(event.type);
  const dt = parseDate(event.date);
  const mem = (event.members || []).map(memberById).filter(Boolean);
  return (
    <div
      className="ecard"
      role="button"
      tabIndex={0}
      onClick={() => onOpen(event.id)}
      onKeyDown={(e) => {
        if (e.key === "Enter") onOpen(event.id);
      }}
    >
      <div className="datebox">
        <div className="mo">{MO[dt.getMonth()]}</div>
        <div className="dd">{dt.getDate()}</div>
        <div className="dow2">{DOW[dt.getDay()]}</div>
      </div>
      <div className="cbody">
        <h3>{event.title}</h3>
        <div className="meta">
          <span className="type-tag" style={{ background: t.color }}>
            {t.label}
          </span>
          {event.time && <span>🕒 {formatTime(event.time)}</span>}
          {event.location && <span>📍 {event.location}</span>}
        </div>
        {mem.length > 0 && (
          <div className="assigned">
            <span className="lbl">Working:</span>
            <div className="avstack">
              {mem.slice(0, 6).map((m) => (
                <Avatar member={m} key={m.id} />
              ))}
            </div>
            {mem.length > 6 && <span className="lbl">+{mem.length - 6}</span>}
          </div>
        )}
      </div>
      {isAdmin && (
        <div className="side">
          <button
            className="btn ghost small"
            onClick={(e) => {
              e.stopPropagation();
              onEdit(event);
            }}
          >
            Edit
          </button>
        </div>
      )}
    </div>
  );
}

function EventsView({ upcoming, isAdmin, memberById, onAdd, onOpen, onEdit }) {
  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> Upcoming events
        </h2>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn primary" onClick={onAdd}>
            + Add event
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <div className="empty">
          <div className="big">No events on the board yet</div>
          <div>{isAdmin ? "Add the first one to get '27 rolling." : "Nothing posted yet."}</div>
        </div>
      ) : (
        <div className="stack">
          {upcoming.map((e) => (
            <EventCard key={e.id} event={e} memberById={memberById} isAdmin={isAdmin} onOpen={onOpen} onEdit={onEdit} />
          ))}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Roster                                                              */
/* ================================================================== */
function RosterView({ members, me, isAdmin, memberUpcoming, onInvite, onOpen }) {
  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> The crew
        </h2>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn primary" onClick={onInvite}>
            + Invite member
          </button>
        )}
      </div>
      {members.length === 0 ? (
        <div className="empty">
          <div className="big">No members yet</div>
          <div>{isAdmin ? "Invite the crew to get started." : "The roster is being set up."}</div>
        </div>
      ) : (
        <div className="roster">
          {members.map((m) => {
            const up = memberUpcoming(m.id).length;
            return (
              <div
                className="mcard"
                key={m.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(m.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(m.id);
                }}
              >
                {m.id === me.id && <div className="me-tag">You</div>}
                {up > 0 && <div className="badge">{up} up</div>}
                <Avatar member={m} size="xl" />
                <div className="nm">{m.name}</div>
                {(m.role || m.is_admin) && (
                  <div className="rl">{m.is_admin ? m.role ? m.role + " · Admin" : "Admin" : m.role}</div>
                )}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Jobs                                                                */
/* ================================================================== */
function JobsView({ jobs, isAdmin, memberById, onAdd, onOpen }) {
  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> Spirit-week jobs
        </h2>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn primary" onClick={onAdd}>
            + Add job
          </button>
        )}
      </div>
      {jobs.length === 0 ? (
        <div className="empty">
          <div className="big">No jobs yet</div>
          <div>
            {isAdmin
              ? "Add a job like posters or window painting, attach a reference, and assign the crew."
              : "Jobs like posters and windows will show up here."}
          </div>
        </div>
      ) : (
        <div className="jobs-grid">
          {jobs.map((j) => {
            const mem = (j.members || []).map(memberById).filter(Boolean);
            return (
              <div
                className="jcard"
                key={j.id}
                role="button"
                tabIndex={0}
                onClick={() => onOpen(j.id)}
                onKeyDown={(e) => {
                  if (e.key === "Enter") onOpen(j.id);
                }}
              >
                <div className="thumb">
                  {j.image_url ? <img src={j.image_url} alt="" /> : <span className="ph">{initials(j.title)}</span>}
                </div>
                <div className="jbody">
                  <div className="jname">{j.title}</div>
                  <div className="jmeta">
                    {mem.length > 0 ? (
                      <div className="avstack">
                        {mem.slice(0, 5).map((m) => (
                          <Avatar member={m} key={m.id} />
                        ))}
                      </div>
                    ) : (
                      <span>Unassigned</span>
                    )}
                    {j.notes_count ? null : null}
                    <span>· {(j.notes || []).length} notes</span>
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ================================================================== */
/* Shopping                                                            */
/* ================================================================== */
function ShoppingView({ shopping, me, isAdmin, memberById, onClaim, onUnclaim, onClear, onAdd, onEdit }) {
  const groups = useMemo(() => {
    const g = {};
    shopping.forEach((it) => {
      const key = it.category || "General";
      (g[key] || (g[key] = [])).push(it);
    });
    return g;
  }, [shopping]);
  const cats = Object.keys(groups);

  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> Shopping list
        </h2>
        <div className="spacer" />
        {isAdmin && (
          <button className="btn primary" onClick={onAdd}>
            + Add item
          </button>
        )}
      </div>
      {shopping.length === 0 ? (
        <div className="empty">
          <div className="big">Nothing on the list yet</div>
          <div>
            {isAdmin
              ? "Add what you need for the next club fair — crew members can sign up to bring each item."
              : "Items to bring will show up here for you to claim."}
          </div>
        </div>
      ) : (
        cats.map((cat) => (
          <div key={cat}>
            <div className="shop-cat">
              <span className="pennant" /> {cat}
            </div>
            <div className="shop-list">
              {groups[cat].map((it) => {
                const claimer = it.claim ? memberById(it.claim.member_id) : null;
                const mine = it.claim && it.claim.member_id === me.id;
                return (
                  <div className={"sitem" + (mine ? " mine" : "")} key={it.id}>
                    <div className="sinfo">
                      <div className="sname">{it.name}</div>
                      {it.qty && <div className="sqty">{it.qty}</div>}
                      {it.note && <div className="snote">{it.note}</div>}
                    </div>
                    <div className="sclaim">
                      {it.claim ? (
                        <span className="claimed-by">
                          <Avatar member={claimer} />
                          {mine ? "You've got it" : claimer ? claimer.name.split(" ")[0] : "Claimed"}
                        </span>
                      ) : (
                        <button className="btn primary small" onClick={() => onClaim(it)}>
                          I&apos;ll bring it
                        </button>
                      )}
                      {mine && (
                        <button className="btn ghost small" onClick={() => onUnclaim(it)}>
                          Unclaim
                        </button>
                      )}
                      {isAdmin && it.claim && !mine && (
                        <button className="btn ghost small" onClick={() => onClear(it)}>
                          Clear
                        </button>
                      )}
                    </div>
                    {isAdmin && (
                      <div className="sadmin-row">
                        <button className="btn ghost small" onClick={() => onEdit(it)}>
                          Edit
                        </button>
                      </div>
                    )}
                  </div>
                );
              })}
            </div>
          </div>
        ))
      )}
    </div>
  );
}

/* ================================================================== */
/* Modal shell                                                         */
/* ================================================================== */
function Modal({ title, children, foot, onClose }) {
  useEffect(() => {
    const onKey = (e) => {
      if (e.key === "Escape") onClose();
    };
    document.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [onClose]);
  return (
    <div
      className="overlay"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose();
      }}
      role="dialog"
      aria-modal="true"
    >
      <div className="modal">
        <div className="modal-head">
          <h3>{title}</h3>
          <button className="x" aria-label="Close" onClick={onClose}>
            ✕
          </button>
        </div>
        <div className="modal-body">{children}</div>
        {foot && <div className="modal-foot">{foot}</div>}
      </div>
    </div>
  );
}

/* ================================================================== */
/* Event editor                                                        */
/* ================================================================== */
function EventEditor({ event, prefillDate, members, onClose, onSaved }) {
  const [title, setTitle] = useState(event?.title || "");
  const [date, setDate] = useState(event?.date || prefillDate || todayYMD());
  const [time, setTime] = useState(event?.time || "");
  const [type, setType] = useState(event?.type || "meeting");
  const [location, setLocation] = useState(event?.location || "");
  const [notes, setNotes] = useState(event?.notes || "");
  const [selected, setSelected] = useState(new Set(event?.members || []));
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function save() {
    setErr("");
    if (!title.trim()) return setErr("Give the event a name.");
    if (!date) return setErr("Pick a date.");
    setBusy(true);
    try {
      const payload = {
        title: title.trim(),
        date,
        time,
        type,
        location: location.trim(),
        notes: notes.trim(),
      };
      let id = event?.id;
      if (event) {
        const { error } = await supabase.from("events").update(payload).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("events").insert(payload).select().single();
        if (error) throw error;
        id = data.id;
      }
      await supabase.from("assignments").delete().eq("event_id", id);
      const rows = [...selected].map((mid) => ({ event_id: id, member_id: mid }));
      if (rows.length) {
        const { error } = await supabase.from("assignments").insert(rows);
        if (error) throw error;
      }
      onSaved(event ? "Event updated" : "Event added ✦");
    } catch (e) {
      setErr(e.message || "Could not save.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { error } = await supabase.from("events").delete().eq("id", event.id);
      if (error) throw error;
      onSaved("Event deleted");
    } catch (e) {
      setErr(e.message || "Could not delete.");
      setBusy(false);
    }
  }

  const foot = (
    <>
      {event ? (
        <button className="btn danger small" onClick={remove} disabled={busy}>
          Delete
        </button>
      ) : (
        <span />
      )}
      <div className="right">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : event ? "Save changes" : "Add event"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title={event ? "Edit event" : "Add event"} onClose={onClose} foot={foot}>
      <label className="fld">
        <span>Event name</span>
        <input type="text" value={title} placeholder="Homecoming setup" onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>
      <div className="row2">
        <label className="fld">
          <span>Date</span>
          <input type="date" value={date} onChange={(e) => setDate(e.target.value)} />
        </label>
        <label className="fld">
          <span>Time (optional)</span>
          <input type="time" value={time} onChange={(e) => setTime(e.target.value)} />
        </label>
      </div>
      <label className="fld">
        <span>Type</span>
        <div className="type-picker">
          {EVENT_TYPES.map((t) => (
            <button
              type="button"
              key={t.id}
              className="type-opt"
              aria-pressed={type === t.id}
              style={{ borderColor: type === t.id ? t.color : undefined }}
              onClick={() => setType(t.id)}
            >
              <span className="swatch" style={{ background: t.color }} />
              {t.label}
            </button>
          ))}
        </div>
      </label>
      <label className="fld">
        <span>Location (optional)</span>
        <input type="text" value={location} placeholder="Main quad" onChange={(e) => setLocation(e.target.value)} />
      </label>
      <label className="fld">
        <span>Notes (optional)</span>
        <textarea value={notes} placeholder="What we're doing, what to bring…" onChange={(e) => setNotes(e.target.value)} />
      </label>
      <label className="fld">
        <span>Who&apos;s working this</span>
      </label>
      {members.length === 0 ? (
        <div className="hint">Invite members first, then assign them here.</div>
      ) : (
        <div className="assign-grid">
          {members.map((m) => (
            <button type="button" key={m.id} className="assign-opt" aria-pressed={selected.has(m.id)} onClick={() => toggle(m.id)}>
              <Avatar member={m} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/* ================================================================== */
/* Event detail                                                        */
/* ================================================================== */
function EventDetail({ event, isAdmin, memberById, onClose, onEdit, onOpenMember }) {
  if (!event) {
    return (
      <Modal title="Event" onClose={onClose}>
        <div className="hint">This event was removed.</div>
      </Modal>
    );
  }
  const t = typeById(event.type);
  const dt = parseDate(event.date);
  const mem = (event.members || []).map(memberById).filter(Boolean);
  const foot = isAdmin ? (
    <div className="right">
      <button className="btn primary" onClick={() => onEdit(event)}>
        Edit event
      </button>
    </div>
  ) : null;

  return (
    <Modal title={event.title} onClose={onClose} foot={foot}>
      <div style={{ display: "flex", gap: 14, alignItems: "center", marginBottom: 14 }}>
        <div className="datebox">
          <div className="mo">{MO[dt.getMonth()]}</div>
          <div className="dd">{dt.getDate()}</div>
          <div className="dow2">{DOW[dt.getDay()]}</div>
        </div>
        <div>
          <span className="type-tag" style={{ background: t.color }}>
            {t.label}
          </span>
          <div className="meta" style={{ marginTop: 8 }}>
            {event.time && <span>🕒 {formatTime(event.time)}</span>}
            {event.location && <span>📍 {event.location}</span>}
          </div>
        </div>
      </div>
      {event.notes && (
        <p style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", fontSize: 14.5, whiteSpace: "pre-wrap" }}>
          {event.notes}
        </p>
      )}
      <div style={{ fontFamily: "'Bringbold', serif", fontSize: 18, margin: "16px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="pennant" /> Working this event
      </div>
      {mem.length > 0 ? (
        <div className="detail-list">
          {mem.map((m) => (
            <div className="item" key={m.id} style={{ cursor: "pointer" }} onClick={() => onOpenMember(m.id)}>
              <Avatar member={m} />
              <div>
                <div style={{ fontWeight: 700 }}>{m.name}</div>
                {m.role && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{m.role}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="hint">{isAdmin ? "No one assigned yet — hit Edit to add the crew." : "No one assigned yet."}</div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Day modal                                                           */
/* ================================================================== */
function DayModal({ date, sortedEvents, isAdmin, memberById, onClose, onOpenEvent, onAdd }) {
  const dt = parseDate(date);
  const dayEvents = sortedEvents.filter((e) => e.date === date);
  const foot = isAdmin ? (
    <div className="right">
      <button className="btn primary" onClick={() => onAdd(date)}>
        + Add event this day
      </button>
    </div>
  ) : null;
  return (
    <Modal title={`${DOW[dt.getDay()]}, ${MO[dt.getMonth()]} ${dt.getDate()}`} onClose={onClose} foot={foot}>
      {dayEvents.length > 0 ? (
        <div className="stack">
          {dayEvents.map((e) => (
            <EventCard key={e.id} event={e} memberById={memberById} isAdmin={false} onOpen={onOpenEvent} onEdit={() => {}} />
          ))}
        </div>
      ) : (
        <div className="hint">{isAdmin ? "Nothing scheduled. Add something below." : "Nothing scheduled for this day."}</div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Member detail                                                       */
/* ================================================================== */
function MemberDetail({ member, me, isAdmin, memberUpcoming, onClose, onEdit, onOpenEvent }) {
  if (!member) {
    return (
      <Modal title="Member" onClose={onClose}>
        <div className="hint">This profile is unavailable.</div>
      </Modal>
    );
  }
  const evs = memberUpcoming(member.id);
  const canEdit = isAdmin || member.id === me.id;
  const foot = canEdit ? (
    <div className="right">
      <button className="btn primary" onClick={() => onEdit(member)}>
        Edit profile
      </button>
    </div>
  ) : null;

  return (
    <Modal title="Member" onClose={onClose} foot={foot}>
      <div className="center-col" style={{ marginBottom: 14 }}>
        <Avatar member={member} size="xl" />
        <div style={{ fontFamily: "'Bringbold', serif", fontSize: 26, marginTop: 8 }}>{member.name}</div>
        {(member.role || member.is_admin) && (
          <div style={{ color: "var(--pink-deep)", fontWeight: 700, textTransform: "uppercase", letterSpacing: "0.05em", fontSize: 13, marginTop: 2 }}>
            {member.is_admin ? (member.role ? member.role + " · Admin" : "Admin") : member.role}
          </div>
        )}
      </div>
      {member.bio && (
        <p style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", fontSize: 14.5, textAlign: "center", whiteSpace: "pre-wrap" }}>
          {member.bio}
        </p>
      )}
      <div style={{ fontFamily: "'Bringbold', serif", fontSize: 18, margin: "16px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="pennant" /> Upcoming shifts
      </div>
      {evs.length > 0 ? (
        <div className="detail-list">
          {evs.map((e) => {
            const ty = typeById(e.type);
            const dt = parseDate(e.date);
            return (
              <div className="item" key={e.id} style={{ cursor: "pointer" }} onClick={() => onOpenEvent(e.id)}>
                <div className="datebox" style={{ flex: "0 0 50px" }}>
                  <div className="mo">{MO[dt.getMonth()]}</div>
                  <div className="dd" style={{ fontSize: 20 }}>
                    {dt.getDate()}
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <div style={{ fontWeight: 700 }}>{e.title}</div>
                  <div className="meta">
                    <span className="type-tag" style={{ background: ty.color }}>
                      {ty.label}
                    </span>
                    {e.time && <span>{formatTime(e.time)}</span>}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hint">No upcoming shifts assigned.</div>
      )}
    </Modal>
  );
}

/* ================================================================== */
/* Member editor (self edit, or admin managing a member)              */
/* ================================================================== */
function MemberEditor({ member, me, isAdmin, callAdmin, onClose, onSaved }) {
  const isSelf = member.id === me.id;
  const [name, setName] = useState(member.name || "");
  const [role, setRole] = useState(member.role || "");
  const [bio, setBio] = useState(member.bio || "");
  const [admin, setAdmin] = useState(!!member.is_admin);
  const [preview, setPreview] = useState(member.photo_url || "");
  const [blob, setBlob] = useState(null);
  const [ext, setExt] = useState("webp");
  const [removePhoto, setRemovePhoto] = useState(false);
  const [newPassword, setNewPassword] = useState("");
  const [resetShown, setResetShown] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const out = await resizeImage(file);
      setBlob(out.blob);
      setExt(out.ext);
      setPreview(out.url);
      setRemovePhoto(false);
    } catch (er) {
      setErr(er.message || "Could not read that image.");
    }
  }

  async function save() {
    setErr("");
    if (!name.trim()) return setErr("Add a name.");
    setBusy(true);
    try {
      let photo_url = member.photo_url || "";
      if (blob) {
        photo_url = await uploadImage("avatars", member.id, blob, ext);
      } else if (removePhoto) {
        photo_url = "";
      }
      const payload = { name: name.trim(), role: role.trim(), bio: bio.trim(), photo_url };
      if (isAdmin && !isSelf) payload.is_admin = admin;
      const { error } = await supabase.from("members").update(payload).eq("id", member.id);
      if (error) throw error;

      if (isSelf && newPassword) {
        if (newPassword.length < 6) throw new Error("New password must be at least 6 characters.");
        const { error: pErr } = await supabase.auth.updateUser({ password: newPassword });
        if (pErr) throw pErr;
      }
      onSaved("Profile saved ✦");
    } catch (e) {
      setErr(e.message || "Could not save.");
      setBusy(false);
    }
  }

  async function doReset() {
    setErr("");
    setBusy(true);
    try {
      const pw = suggestPassword();
      await callAdmin("resetPassword", { memberId: member.id, newPassword: pw });
      setResetShown(pw);
    } catch (e) {
      setErr(e.message || "Could not reset password.");
    }
    setBusy(false);
  }

  async function doRemove() {
    setBusy(true);
    try {
      await callAdmin("removeMember", { memberId: member.id });
      onSaved("Member removed");
    } catch (e) {
      setErr(e.message || "Could not remove.");
      setBusy(false);
    }
  }

  const foot = (
    <>
      {isAdmin && !isSelf ? (
        <button className="btn danger small" onClick={doRemove} disabled={busy}>
          Remove member
        </button>
      ) : (
        <span />
      )}
      <div className="right">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title={isSelf ? "Edit my profile" : "Edit profile"} onClose={onClose} foot={foot}>
      <div className="photo-row">
        <div>
          {preview ? (
            <span className="av lg">
              <img src={preview} alt="" />
            </span>
          ) : (
            <span className="av lg">{initials(name) || "?"}</span>
          )}
        </div>
        <div className="photo-uploader">
          <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Profile photo</div>
          <input type="file" accept="image/*" onChange={onFile} style={{ fontSize: 13 }} />
          {preview && (
            <button
              className="btn ghost small"
              style={{ marginTop: 8 }}
              onClick={() => {
                setBlob(null);
                setPreview("");
                setRemovePhoto(true);
              }}
            >
              Remove photo
            </button>
          )}
        </div>
      </div>

      <label className="fld">
        <span>Name</span>
        <input type="text" value={name} placeholder="First Last" onChange={(e) => setName(e.target.value)} />
      </label>
      <label className="fld">
        <span>Role / title (optional)</span>
        <input type="text" value={role} placeholder="President, Commissioner, Member…" onChange={(e) => setRole(e.target.value)} />
      </label>
      <label className="fld">
        <span>About (optional)</span>
        <textarea value={bio} placeholder="Grade, committee, fun fact…" onChange={(e) => setBio(e.target.value)} />
      </label>

      {isSelf && (
        <>
          <hr className="divider" />
          <label className="fld">
            <span>Change my password (optional)</span>
            <input type="password" value={newPassword} placeholder="New password" onChange={(e) => setNewPassword(e.target.value)} />
          </label>
        </>
      )}

      {isAdmin && !isSelf && (
        <>
          <hr className="divider" />
          <div className="check-row">
            <input id="adminToggle" type="checkbox" checked={admin} onChange={(e) => setAdmin(e.target.checked)} />
            <label htmlFor="adminToggle">Admin — can manage events, jobs, shopping, and the roster</label>
          </div>
          <button className="btn ghost small" onClick={doReset} disabled={busy}>
            Reset this member&apos;s password
          </button>
          {resetShown && (
            <div className="cred-box" style={{ marginTop: 10 }}>
              New temporary password: <code>{resetShown}</code>
              <div className="hint" style={{ marginTop: 6, marginBottom: 0 }}>
                Share it with them — they can change it under Edit my profile.
              </div>
            </div>
          )}
        </>
      )}

      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

/* ================================================================== */
/* Invite modal                                                        */
/* ================================================================== */
function InviteModal({ callAdmin, onClose, onDone }) {
  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState(suggestPassword());
  const [done, setDone] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function invite() {
    setErr("");
    if (!name.trim() || !email.trim()) return setErr("Add a name and email.");
    setBusy(true);
    try {
      await callAdmin("inviteMember", { name: name.trim(), email: email.trim(), tempPassword: password });
      setDone(true);
    } catch (e) {
      setErr(e.message || "Could not create the account.");
      setBusy(false);
    }
  }

  if (done) {
    const foot = (
      <div className="right">
        <button
          className="btn primary"
          onClick={async () => {
            await onDone();
            onClose();
          }}
        >
          Done
        </button>
      </div>
    );
    return (
      <Modal title="Member invited ✦" onClose={onClose} foot={foot}>
        <p className="hint">Share these with {name.split(" ")[0]}. They sign in with them, then can change the password under Edit my profile.</p>
        <div className="cred-box">
          Email: <code>{email.trim().toLowerCase()}</code>
          <div style={{ marginTop: 8 }}>
            Temporary password: <code>{password}</code>
          </div>
        </div>
      </Modal>
    );
  }

  const foot = (
    <>
      <span />
      <div className="right">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={invite} disabled={busy}>
          {busy ? "Creating…" : "Create login"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title="Invite a member" onClose={onClose} foot={foot}>
      <p className="hint">This makes an account with a starting password you share. No email is sent.</p>
      <label className="fld">
        <span>Name</span>
        <input type="text" value={name} placeholder="First Last" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <label className="fld">
        <span>Email</span>
        <input type="email" value={email} placeholder="them@example.com" onChange={(e) => setEmail(e.target.value)} />
      </label>
      <label className="fld">
        <span>Temporary password</span>
        <input type="text" value={password} onChange={(e) => setPassword(e.target.value)} />
      </label>
      <button className="btn ghost small" onClick={() => setPassword(suggestPassword())}>
        Suggest another
      </button>
      {err && <div className="err" style={{ marginTop: 10 }}>{err}</div>}
    </Modal>
  );
}

/* ================================================================== */
/* Banner editor                                                       */
/* ================================================================== */
function BannerEditor({ banner, onClose, onSaved }) {
  const [text, setText] = useState(banner.banner_text || "");
  const [enabled, setEnabled] = useState(!!banner.banner_enabled);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setBusy(true);
    setErr("");
    try {
      const { error } = await supabase
        .from("settings")
        .update({ banner_text: text, banner_enabled: enabled, updated_at: new Date().toISOString() })
        .eq("id", 1);
      if (error) throw error;
      onSaved("Banner updated");
    } catch (e) {
      setErr(e.message || "Could not save.");
      setBusy(false);
    }
  }

  const foot = (
    <>
      <span />
      <div className="right">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : "Save"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title="Edit announcement banner" onClose={onClose} foot={foot}>
      <label className="fld">
        <span>Banner text</span>
        <textarea value={text} onChange={(e) => setText(e.target.value)} placeholder="Can't make it? Let Natalie, Emily, or Victoria know in advance." />
      </label>
      <div className="check-row">
        <input id="bannerOn" type="checkbox" checked={enabled} onChange={(e) => setEnabled(e.target.checked)} />
        <label htmlFor="bannerOn">Show the banner</label>
      </div>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

/* ================================================================== */
/* Job editor                                                          */
/* ================================================================== */
function JobEditor({ job, members, onClose, onSaved }) {
  const [title, setTitle] = useState(job?.title || "");
  const [notes, setNotes] = useState(job?.notes || "");
  const [selected, setSelected] = useState(new Set(job?.members || []));
  const [preview, setPreview] = useState(job?.image_url || "");
  const [blob, setBlob] = useState(null);
  const [ext, setExt] = useState("webp");
  const [removeImg, setRemoveImg] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  function toggle(id) {
    const next = new Set(selected);
    next.has(id) ? next.delete(id) : next.add(id);
    setSelected(next);
  }

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const out = await resizeImage(file, 1000);
      setBlob(out.blob);
      setExt(out.ext);
      setPreview(out.url);
      setRemoveImg(false);
    } catch (er) {
      setErr(er.message || "Could not read that image.");
    }
  }

  async function save() {
    setErr("");
    if (!title.trim()) return setErr("Give the job a name.");
    setBusy(true);
    try {
      let id = job?.id;
      const base = { title: title.trim(), notes: notes.trim() };
      if (job) {
        const { error } = await supabase.from("jobs").update(base).eq("id", id);
        if (error) throw error;
      } else {
        const { data, error } = await supabase.from("jobs").insert(base).select().single();
        if (error) throw error;
        id = data.id;
      }
      if (blob) {
        const url = await uploadImage("job-images", id, blob, ext);
        const { error } = await supabase.from("jobs").update({ image_url: url }).eq("id", id);
        if (error) throw error;
      } else if (removeImg) {
        await supabase.from("jobs").update({ image_url: "" }).eq("id", id);
      }
      await supabase.from("job_members").delete().eq("job_id", id);
      const rows = [...selected].map((mid) => ({ job_id: id, member_id: mid }));
      if (rows.length) {
        const { error } = await supabase.from("job_members").insert(rows);
        if (error) throw error;
      }
      onSaved(job ? "Job updated" : "Job added ✦");
    } catch (e) {
      setErr(e.message || "Could not save.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { error } = await supabase.from("jobs").delete().eq("id", job.id);
      if (error) throw error;
      onSaved("Job deleted");
    } catch (e) {
      setErr(e.message || "Could not delete.");
      setBusy(false);
    }
  }

  const foot = (
    <>
      {job ? (
        <button className="btn danger small" onClick={remove} disabled={busy}>
          Delete
        </button>
      ) : (
        <span />
      )}
      <div className="right">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : job ? "Save changes" : "Add job"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title={job ? "Edit job" : "Add job"} onClose={onClose} foot={foot}>
      <label className="fld">
        <span>Job name</span>
        <input type="text" value={title} placeholder="Spirit week posters" onChange={(e) => setTitle(e.target.value)} autoFocus />
      </label>

      <div className="photo-row">
        <div>
          {preview ? (
            <img src={preview} alt="" style={{ width: 90, height: 66, objectFit: "cover", borderRadius: 10, border: "1.5px solid var(--line)" }} />
          ) : (
            <span className="av lg">{initials(title) || "?"}</span>
          )}
        </div>
        <div className="photo-uploader">
          <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>Reference image (optional)</div>
          <input type="file" accept="image/*" onChange={onFile} style={{ fontSize: 13 }} />
          {preview && (
            <button
              className="btn ghost small"
              style={{ marginTop: 8 }}
              onClick={() => {
                setBlob(null);
                setPreview("");
                setRemoveImg(true);
              }}
            >
              Remove image
            </button>
          )}
        </div>
      </div>

      <label className="fld">
        <span>Notes (optional)</span>
        <textarea value={notes} placeholder="Colors, theme, materials, where to meet…" onChange={(e) => setNotes(e.target.value)} />
      </label>

      <label className="fld">
        <span>Assign the crew</span>
      </label>
      {members.length === 0 ? (
        <div className="hint">Invite members first, then assign them here.</div>
      ) : (
        <div className="assign-grid">
          {members.map((m) => (
            <button type="button" key={m.id} className="assign-opt" aria-pressed={selected.has(m.id)} onClick={() => toggle(m.id)}>
              <Avatar member={m} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/* ================================================================== */
/* Job detail (with shared notes thread)                               */
/* ================================================================== */
function JobDetail({ job, me, isAdmin, memberById, onClose, onEdit, onAddNote, onDeleteNote, onOpenMember }) {
  const [draft, setDraft] = useState("");
  const [busy, setBusy] = useState(false);
  const [err, setErr] = useState("");

  if (!job) {
    return (
      <Modal title="Job" onClose={onClose}>
        <div className="hint">This job was removed.</div>
      </Modal>
    );
  }

  const mem = (job.members || []).map(memberById).filter(Boolean);
  const notes = job.notes || [];

  async function submitNote() {
    if (!draft.trim()) return;
    setBusy(true);
    setErr("");
    try {
      await onAddNote(job.id, draft.trim());
      setDraft("");
    } catch (e) {
      setErr(e.message || "Could not add note.");
    }
    setBusy(false);
  }

  const foot = isAdmin ? (
    <div className="right">
      <button className="btn primary" onClick={() => onEdit(job)}>
        Edit job
      </button>
    </div>
  ) : null;

  return (
    <Modal title={job.title} onClose={onClose} foot={foot}>
      {job.image_url && <img className="job-image" src={job.image_url} alt="" />}
      {job.notes && (
        <p style={{ background: "#fff", border: "1.5px solid var(--line)", borderRadius: 12, padding: "12px 14px", fontSize: 14.5, whiteSpace: "pre-wrap" }}>
          {job.notes}
        </p>
      )}

      <div style={{ fontFamily: "'Bringbold', serif", fontSize: 18, margin: "16px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="pennant" /> On this job
      </div>
      {mem.length > 0 ? (
        <div className="detail-list">
          {mem.map((m) => (
            <div className="item" key={m.id} style={{ cursor: "pointer" }} onClick={() => onOpenMember(m.id)}>
              <Avatar member={m} />
              <div>
                <div style={{ fontWeight: 700 }}>{m.name}</div>
                {m.role && <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{m.role}</div>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="hint">No one assigned yet.</div>
      )}

      <div style={{ fontFamily: "'Bringbold', serif", fontSize: 18, margin: "18px 0 10px", display: "flex", alignItems: "center", gap: 8 }}>
        <span className="pennant" /> Notes
      </div>
      {notes.length > 0 ? (
        <div className="notes-thread">
          {notes.map((n) => {
            const author = memberById(n.author_member_id);
            const canDelete = isAdmin || (author && author.id === me.id);
            return (
              <div className="note" key={n.id}>
                <div className="nhead">
                  <Avatar member={author} />
                  <span className="nauthor">{author ? author.name.split(" ")[0] : "Someone"}</span>
                  <span className="ntime">{relTime(n.created_at)}</span>
                  {canDelete && (
                    <button
                      className="btn ghost small"
                      style={{ marginLeft: "auto", padding: "2px 8px" }}
                      onClick={() => onDeleteNote(n.id)}
                    >
                      Delete
                    </button>
                  )}
                </div>
                <div className="nbody">{n.body}</div>
              </div>
            );
          })}
        </div>
      ) : (
        <div className="hint">No notes yet — start the thread below.</div>
      )}

      <div className="add-note">
        <textarea
          value={draft}
          placeholder="Add a note for the crew…"
          onChange={(e) => setDraft(e.target.value)}
        />
        <button className="btn primary" onClick={submitNote} disabled={busy}>
          {busy ? "…" : "Post"}
        </button>
      </div>
      {err && <div className="err" style={{ marginTop: 8 }}>{err}</div>}
    </Modal>
  );
}

/* ================================================================== */
/* Shopping item editor                                                */
/* ================================================================== */
function ShopEditor({ item, onClose, onSaved }) {
  const [name, setName] = useState(item?.name || "");
  const [qty, setQty] = useState(item?.qty || "");
  const [category, setCategory] = useState(item?.category || "");
  const [note, setNote] = useState(item?.note || "");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function save() {
    setErr("");
    if (!name.trim()) return setErr("Add an item name.");
    setBusy(true);
    try {
      const payload = { name: name.trim(), qty: qty.trim(), category: category.trim(), note: note.trim() };
      if (item) {
        const { error } = await supabase.from("shopping_items").update(payload).eq("id", item.id);
        if (error) throw error;
      } else {
        const { error } = await supabase.from("shopping_items").insert(payload);
        if (error) throw error;
      }
      onSaved(item ? "Item updated" : "Item added ✦");
    } catch (e) {
      setErr(e.message || "Could not save.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      const { error } = await supabase.from("shopping_items").delete().eq("id", item.id);
      if (error) throw error;
      onSaved("Item removed");
    } catch (e) {
      setErr(e.message || "Could not remove.");
      setBusy(false);
    }
  }

  const foot = (
    <>
      {item ? (
        <button className="btn danger small" onClick={remove} disabled={busy}>
          Remove
        </button>
      ) : (
        <span />
      )}
      <div className="right">
        <button className="btn ghost" onClick={onClose} disabled={busy}>
          Cancel
        </button>
        <button className="btn primary" onClick={save} disabled={busy}>
          {busy ? "Saving…" : item ? "Save" : "Add item"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title={item ? "Edit item" : "Add item"} onClose={onClose} foot={foot}>
      <label className="fld">
        <span>Item</span>
        <input type="text" value={name} placeholder="Water bottles" onChange={(e) => setName(e.target.value)} autoFocus />
      </label>
      <div className="row2">
        <label className="fld">
          <span>Amount (optional)</span>
          <input type="text" value={qty} placeholder="2 cases" onChange={(e) => setQty(e.target.value)} />
        </label>
        <label className="fld">
          <span>Which event (optional)</span>
          <input type="text" value={category} placeholder="Fall club fair" onChange={(e) => setCategory(e.target.value)} />
        </label>
      </div>
      <label className="fld">
        <span>Note (optional)</span>
        <input type="text" value={note} placeholder="Get the small ones" onChange={(e) => setNote(e.target.value)} />
      </label>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}
