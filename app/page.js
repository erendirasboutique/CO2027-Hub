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
  resizeImage,
} from "@/lib/util";

/* ------------------------------------------------------------------ */
/* Small shared pieces                                                 */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Main app                                                            */
/* ------------------------------------------------------------------ */
export default function Page() {
  const [ready, setReady] = useState(false);
  const [members, setMembers] = useState([]);
  const [events, setEvents] = useState([]);

  const [isOfficer, setIsOfficer] = useState(false);
  const [code, setCode] = useState("");

  const [view, setView] = useState("calendar");
  const [calCursor, setCalCursor] = useState(() => new Date());
  const [modal, setModal] = useState(null);
  const [toastMsg, setToastMsg] = useState("");

  const showToast = useCallback((msg) => setToastMsg(msg), []);
  useEffect(() => {
    if (!toastMsg) return;
    const t = setTimeout(() => setToastMsg(""), 1900);
    return () => clearTimeout(t);
  }, [toastMsg]);

  // --- read (public, anon key) ---
  const loadAll = useCallback(async () => {
    const [mRes, eRes, aRes] = await Promise.all([
      supabase.from("members").select("*").order("created_at", { ascending: true }),
      supabase.from("events").select("*").order("date", { ascending: true }),
      supabase.from("assignments").select("*"),
    ]);
    const mem = mRes.data || [];
    const byEvent = {};
    (aRes.data || []).forEach((a) => {
      if (!byEvent[a.event_id]) byEvent[a.event_id] = [];
      byEvent[a.event_id].push(a.member_id);
    });
    const evs = (eRes.data || []).map((e) => ({ ...e, members: byEvent[e.id] || [] }));
    return { members: mem, events: evs };
  }, []);

  const reload = useCallback(async () => {
    const fresh = await loadAll();
    setMembers(fresh.members);
    setEvents(fresh.events);
  }, [loadAll]);

  useEffect(() => {
    (async () => {
      await reload();
      setReady(true);
    })();
  }, [reload]);

  // --- write (server route, passcode-gated) ---
  const callAdmin = useCallback(
    async (op, data, overrideCode) => {
      const res = await fetch("/api/admin", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ code: overrideCode ?? code, op, data: data || {} }),
      });
      const j = await res.json().catch(() => ({}));
      if (!res.ok) throw new Error(j.error || "Request failed");
      return j;
    },
    [code]
  );

  const onSaved = useCallback(
    async (msg) => {
      await reload();
      setModal(null);
      if (msg) showToast(msg);
    },
    [reload, showToast]
  );

  const memberById = useCallback((id) => members.find((m) => m.id === id), [members]);

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

  function logout() {
    setIsOfficer(false);
    setCode("");
    showToast("Editing locked");
  }

  if (!ready) return <Splash />;

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
            <div className="subline">
              Shared HQ for events, shifts, and the crew that runs them.
            </div>
          </div>
          <div className="hero-actions">
            {isOfficer ? (
              <>
                <span className="officer-flag">
                  <span className="pennant" /> Officer mode
                </span>
                <button className="btn ghost small" onClick={logout}>
                  Lock editing
                </button>
              </>
            ) : (
              <button
                className="btn primary"
                onClick={() => setModal({ kind: "officerLogin" })}
              >
                Officer login
              </button>
            )}
          </div>
        </div>
      </header>

      <nav className="tabs">
        <div className="tabs-inner">
          <button
            className="tab"
            role="tab"
            aria-selected={view === "calendar"}
            onClick={() => setView("calendar")}
          >
            Calendar
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={view === "events"}
            onClick={() => setView("events")}
          >
            Events <span className="cnt">{upcoming.length}</span>
          </button>
          <button
            className="tab"
            role="tab"
            aria-selected={view === "roster"}
            onClick={() => setView("roster")}
          >
            Roster <span className="cnt">{members.length}</span>
          </button>
        </div>
      </nav>

      <main>
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
            isOfficer={isOfficer}
            memberById={memberById}
            onAdd={() => setModal({ kind: "eventEditor", event: null })}
            onOpen={(id) => setModal({ kind: "eventDetail", id })}
            onEdit={(ev) => setModal({ kind: "eventEditor", event: ev })}
          />
        )}
        {view === "roster" && (
          <RosterView
            members={members}
            isOfficer={isOfficer}
            memberUpcoming={memberUpcoming}
            onAdd={() => setModal({ kind: "memberEditor", member: null })}
            onOpen={(id) => setModal({ kind: "memberDetail", id })}
          />
        )}
      </main>

      <footer>Class of 2027 · Jurupa Hills High School · Built for the ASB crew.</footer>

      {/* Modals */}
      {modal?.kind === "officerLogin" && (
        <OfficerLogin
          onClose={() => setModal(null)}
          onVerify={async (entered) => {
            await callAdmin("verify", {}, entered);
            setCode(entered);
            setIsOfficer(true);
            setModal(null);
            showToast("Welcome back, officer ✦");
          }}
        />
      )}
      {modal?.kind === "eventEditor" && (
        <EventEditor
          event={modal.event}
          prefillDate={modal.prefillDate}
          members={members}
          callAdmin={callAdmin}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === "memberEditor" && (
        <MemberEditor
          member={modal.member}
          callAdmin={callAdmin}
          onClose={() => setModal(null)}
          onSaved={onSaved}
        />
      )}
      {modal?.kind === "eventDetail" && (
        <EventDetail
          event={events.find((e) => e.id === modal.id)}
          isOfficer={isOfficer}
          memberById={memberById}
          onClose={() => setModal(null)}
          onEdit={(ev) => setModal({ kind: "eventEditor", event: ev })}
          onOpenMember={(id) => setModal({ kind: "memberDetail", id })}
        />
      )}
      {modal?.kind === "memberDetail" && (
        <MemberDetail
          member={memberById(modal.id)}
          isOfficer={isOfficer}
          memberUpcoming={memberUpcoming}
          onClose={() => setModal(null)}
          onEdit={(m) => setModal({ kind: "memberEditor", member: m })}
          onOpenEvent={(id) => setModal({ kind: "eventDetail", id })}
        />
      )}
      {modal?.kind === "day" && (
        <DayModal
          date={modal.date}
          sortedEvents={sortedEvents}
          isOfficer={isOfficer}
          memberById={memberById}
          onClose={() => setModal(null)}
          onOpenEvent={(id) => setModal({ kind: "eventDetail", id })}
          onAdd={(ds) => setModal({ kind: "eventEditor", event: null, prefillDate: ds })}
        />
      )}

      <div className={"toast" + (toastMsg ? " show" : "")}>{toastMsg}</div>
    </>
  );
}

/* ------------------------------------------------------------------ */
/* Officer login                                                       */
/* ------------------------------------------------------------------ */
function OfficerLogin({ onClose, onVerify }) {
  const [value, setValue] = useState("");
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function submit() {
    setErr("");
    if (!value.trim()) {
      setErr("Enter the officer passcode.");
      return;
    }
    setBusy(true);
    try {
      await onVerify(value.trim());
    } catch (e) {
      setErr(e.message || "That passcode didn't match.");
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
        <button className="btn primary" onClick={submit} disabled={busy}>
          {busy ? "Checking…" : "Log in"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title="Officer login" onClose={onClose} foot={foot}>
      <p className="hint">
        Enter the shared officer passcode to add events, manage the roster, and assign shifts.
      </p>
      <label className="fld">
        <span>Officer passcode</span>
        <input
          type="password"
          value={value}
          placeholder="passcode"
          autoFocus
          onChange={(e) => setValue(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") submit();
          }}
        />
      </label>
      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Calendar                                                            */
/* ------------------------------------------------------------------ */
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
          <button
            className="icon-btn"
            aria-label="Previous month"
            onClick={() => setCursor(new Date(y, m - 1, 1))}
          >
            ‹
          </button>
          <button className="btn ghost small" onClick={() => setCursor(new Date())}>
            Today
          </button>
          <button
            className="icon-btn"
            aria-label="Next month"
            onClick={() => setCursor(new Date(y, m + 1, 1))}
          >
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
                      <span
                        className="dot"
                        key={e.id}
                        style={{ background: typeById(e.type).color }}
                      />
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
                  {dayEvents.length > 3 && (
                    <div className="more-tag">+{dayEvents.length - 3} more</div>
                  )}
                </>
              )}
            </div>
          );
        })}
      </div>

      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 16 }}>
        {EVENT_TYPES.map((t) => (
          <span
            key={t.id}
            style={{
              fontSize: 12.5,
              color: "var(--ink-soft)",
              display: "inline-flex",
              alignItems: "center",
            }}
          >
            <span
              className="dot"
              style={{ display: "inline-block", background: t.color, marginRight: 6 }}
            />
            {t.label}
          </span>
        ))}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Events list                                                         */
/* ------------------------------------------------------------------ */
function EventCard({ event, memberById, isOfficer, onOpen, onEdit }) {
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
      {isOfficer && (
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

function EventsView({ upcoming, isOfficer, memberById, onAdd, onOpen, onEdit }) {
  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> Upcoming events
        </h2>
        <div className="spacer" />
        {isOfficer && (
          <button className="btn primary" onClick={onAdd}>
            + Add event
          </button>
        )}
      </div>
      {upcoming.length === 0 ? (
        <div className="empty">
          <div className="big">No events on the board yet</div>
          <div>
            {isOfficer
              ? "Add the first one to get '27 rolling."
              : "Officers will post events here soon."}
          </div>
        </div>
      ) : (
        <div className="stack">
          {upcoming.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              memberById={memberById}
              isOfficer={isOfficer}
              onOpen={onOpen}
              onEdit={onEdit}
            />
          ))}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Roster                                                              */
/* ------------------------------------------------------------------ */
function RosterView({ members, isOfficer, memberUpcoming, onAdd, onOpen }) {
  return (
    <div>
      <div className="view-head">
        <h2>
          <span className="pennant" /> The crew
        </h2>
        <div className="spacer" />
        {isOfficer && (
          <button className="btn primary" onClick={onAdd}>
            + Add member
          </button>
        )}
      </div>
      {members.length === 0 ? (
        <div className="empty">
          <div className="big">The roster is empty</div>
          <div>
            {isOfficer
              ? "Add all 14 — photo, name, and role."
              : "Officers are still setting up the roster."}
          </div>
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
                {up > 0 && <div className="badge">{up} up</div>}
                <Avatar member={m} size="xl" />
                <div className="nm">{m.name}</div>
                {m.role && <div className="rl">{m.role}</div>}
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Modal shell                                                         */
/* ------------------------------------------------------------------ */
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

/* ------------------------------------------------------------------ */
/* Event editor                                                        */
/* ------------------------------------------------------------------ */
function EventEditor({ event, prefillDate, members, callAdmin, onClose, onSaved }) {
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
    if (next.has(id)) next.delete(id);
    else next.add(id);
    setSelected(next);
  }

  async function save() {
    setErr("");
    if (!title.trim()) {
      setErr("Give the event a name.");
      return;
    }
    if (!date) {
      setErr("Pick a date.");
      return;
    }
    setBusy(true);
    try {
      await callAdmin("saveEvent", {
        id: event?.id,
        title: title.trim(),
        date,
        time,
        type,
        location: location.trim(),
        notes: notes.trim(),
        memberIds: [...selected],
      });
      onSaved(event ? "Event updated" : "Event added ✦");
    } catch (e) {
      setErr(e.message || "Could not save. Try again.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await callAdmin("deleteEvent", { id: event.id });
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
          Delete event
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
        <input
          type="text"
          value={title}
          placeholder="Homecoming setup"
          onChange={(e) => setTitle(e.target.value)}
          autoFocus
        />
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
        <input
          type="text"
          value={location}
          placeholder="Main quad"
          onChange={(e) => setLocation(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>Notes (optional)</span>
        <textarea
          value={notes}
          placeholder="What we're doing, what to bring…"
          onChange={(e) => setNotes(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>Who&apos;s working this</span>
      </label>
      {members.length === 0 ? (
        <div className="hint">Add members in the Roster tab first, then assign them here.</div>
      ) : (
        <div className="assign-grid">
          {members.map((m) => (
            <button
              type="button"
              key={m.id}
              className="assign-opt"
              aria-pressed={selected.has(m.id)}
              onClick={() => toggle(m.id)}
            >
              <Avatar member={m} />
              <span>{m.name}</span>
            </button>
          ))}
        </div>
      )}
      {err && (
        <div className="err" style={{ marginTop: 8 }}>
          {err}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Member editor                                                       */
/* ------------------------------------------------------------------ */
function MemberEditor({ member, callAdmin, onClose, onSaved }) {
  const [name, setName] = useState(member?.name || "");
  const [role, setRole] = useState(member?.role || "");
  const [bio, setBio] = useState(member?.bio || "");
  const [preview, setPreview] = useState(member?.photo_url || "");
  const [imageDataUrl, setImageDataUrl] = useState(null);
  const [removePhoto, setRemovePhoto] = useState(false);
  const [err, setErr] = useState("");
  const [busy, setBusy] = useState(false);

  async function onFile(e) {
    const file = e.target.files?.[0];
    if (!file) return;
    try {
      const out = await resizeImage(file);
      setImageDataUrl(out.dataUrl);
      setPreview(out.dataUrl);
      setRemovePhoto(false);
    } catch (er) {
      setErr(er.message || "Could not read that image.");
    }
  }

  async function save() {
    setErr("");
    if (!name.trim()) {
      setErr("Add a name.");
      return;
    }
    setBusy(true);
    try {
      await callAdmin("saveMember", {
        id: member?.id,
        name: name.trim(),
        role: role.trim(),
        bio: bio.trim(),
        imageDataUrl: imageDataUrl || undefined,
        removePhoto: removePhoto || undefined,
      });
      onSaved(member ? "Profile saved ✦" : "Member added ✦");
    } catch (e) {
      setErr(e.message || "Could not save. Try again.");
      setBusy(false);
    }
  }

  async function remove() {
    setBusy(true);
    try {
      await callAdmin("deleteMember", { id: member.id });
      onSaved("Member removed");
    } catch (e) {
      setErr(e.message || "Could not remove.");
      setBusy(false);
    }
  }

  const foot = (
    <>
      {member ? (
        <button className="btn danger small" onClick={remove} disabled={busy}>
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
          {busy ? "Saving…" : member ? "Save" : "Add member"}
        </button>
      </div>
    </>
  );

  return (
    <Modal title={member ? "Edit profile" : "Add member"} onClose={onClose} foot={foot}>
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
          <div style={{ fontWeight: 700, color: "var(--ink)", marginBottom: 4 }}>
            Profile photo
          </div>
          <input type="file" accept="image/*" onChange={onFile} style={{ fontSize: 13 }} />
          {preview && (
            <button
              className="btn ghost small"
              style={{ marginTop: 8 }}
              onClick={() => {
                setImageDataUrl(null);
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
        <input
          type="text"
          value={name}
          placeholder="First Last"
          onChange={(e) => setName(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>Role / title (optional)</span>
        <input
          type="text"
          value={role}
          placeholder="President, Commissioner, Member…"
          onChange={(e) => setRole(e.target.value)}
        />
      </label>
      <label className="fld">
        <span>About (optional)</span>
        <textarea
          value={bio}
          placeholder="Grade, committee, fun fact…"
          onChange={(e) => setBio(e.target.value)}
        />
      </label>

      {err && <div className="err">{err}</div>}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Event detail                                                        */
/* ------------------------------------------------------------------ */
function EventDetail({ event, isOfficer, memberById, onClose, onEdit, onOpenMember }) {
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

  const foot = isOfficer ? (
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
        <p
          style={{
            background: "#fff",
            border: "1.5px solid var(--line)",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 14.5,
            whiteSpace: "pre-wrap",
          }}
        >
          {event.notes}
        </p>
      )}

      <div
        style={{
          fontFamily: "'Bringbold', serif",
          fontSize: 18,
          margin: "16px 0 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="pennant" /> Working this event
      </div>
      {mem.length > 0 ? (
        <div className="detail-list">
          {mem.map((m) => (
            <div
              className="item"
              key={m.id}
              style={{ cursor: "pointer" }}
              onClick={() => onOpenMember(m.id)}
            >
              <Avatar member={m} />
              <div>
                <div style={{ fontWeight: 700 }}>{m.name}</div>
                {m.role && (
                  <div style={{ fontSize: 12.5, color: "var(--ink-soft)" }}>{m.role}</div>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="hint">
          {isOfficer ? "No one assigned yet — hit Edit to add the crew." : "No one assigned yet."}
        </div>
      )}
    </Modal>
  );
}

/* ------------------------------------------------------------------ */
/* Member detail                                                       */
/* ------------------------------------------------------------------ */
function MemberDetail({ member, isOfficer, memberUpcoming, onClose, onEdit, onOpenEvent }) {
  if (!member) {
    return (
      <Modal title="Member" onClose={onClose}>
        <div className="hint">This profile is unavailable.</div>
      </Modal>
    );
  }
  const evs = memberUpcoming(member.id);

  const foot = isOfficer ? (
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
        <div style={{ fontFamily: "'Bringbold', serif", fontSize: 26, marginTop: 8 }}>
          {member.name}
        </div>
        {member.role && (
          <div
            style={{
              color: "var(--pink-deep)",
              fontWeight: 700,
              textTransform: "uppercase",
              letterSpacing: "0.05em",
              fontSize: 13,
              marginTop: 2,
            }}
          >
            {member.role}
          </div>
        )}
      </div>

      {member.bio && (
        <p
          style={{
            background: "#fff",
            border: "1.5px solid var(--line)",
            borderRadius: 12,
            padding: "12px 14px",
            fontSize: 14.5,
            textAlign: "center",
            whiteSpace: "pre-wrap",
          }}
        >
          {member.bio}
        </p>
      )}

      <div
        style={{
          fontFamily: "'Bringbold', serif",
          fontSize: 18,
          margin: "16px 0 10px",
          display: "flex",
          alignItems: "center",
          gap: 8,
        }}
      >
        <span className="pennant" /> Upcoming shifts
      </div>
      {evs.length > 0 ? (
        <div className="detail-list">
          {evs.map((e) => {
            const ty = typeById(e.type);
            const dt = parseDate(e.date);
            return (
              <div
                className="item"
                key={e.id}
                style={{ cursor: "pointer" }}
                onClick={() => onOpenEvent(e.id)}
              >
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
                    {e.location && <span>📍 {e.location}</span>}
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

/* ------------------------------------------------------------------ */
/* Day modal                                                           */
/* ------------------------------------------------------------------ */
function DayModal({ date, sortedEvents, isOfficer, memberById, onClose, onOpenEvent, onAdd }) {
  const dt = parseDate(date);
  const dayEvents = sortedEvents.filter((e) => e.date === date);

  const foot = isOfficer ? (
    <div className="right">
      <button className="btn primary" onClick={() => onAdd(date)}>
        + Add event this day
      </button>
    </div>
  ) : null;

  return (
    <Modal
      title={`${DOW[dt.getDay()]}, ${MO[dt.getMonth()]} ${dt.getDate()}`}
      onClose={onClose}
      foot={foot}
    >
      {dayEvents.length > 0 ? (
        <div className="stack">
          {dayEvents.map((e) => (
            <EventCard
              key={e.id}
              event={e}
              memberById={memberById}
              isOfficer={false}
              onOpen={onOpenEvent}
              onEdit={() => {}}
            />
          ))}
        </div>
      ) : (
        <div className="hint">
          {isOfficer
            ? "Nothing scheduled. Add something below."
            : "Nothing scheduled for this day."}
        </div>
      )}
    </Modal>
  );
}
