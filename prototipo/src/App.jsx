import { useEffect, useRef, useState } from "react";
import {
  Activity,
  ArrowRight,
  Award,
  Bell,
  Check,
  ChevronDown,
  CircleHelp,
  Clock3,
  Clapperboard,
  Flag,
  LayoutDashboard,
  ListOrdered,
  Pause,
  Pencil,
  Play,
  Plus,
  Radio,
  RotateCcw,
  Settings2,
  ShieldCheck,
  Square,
  Trash2,
  UsersRound,
  Video,
} from "lucide-react";
import { CameraPicker, LiveStudio, LiveViewer } from "./LiveBroadcast.jsx";
import { VodViewer } from "./VodViewer.jsx";
import { VodLibraryView } from "./VodLibraryView.jsx";
import { ScoreViewer } from "./ScoreViewer.jsx";
import { StreamsView } from "./StreamsView.jsx";
import { TournamentWizard } from "./TournamentWizard.jsx";
import {
  ActionMenu,
  Avatar,
  ConfirmDialog,
  Modal,
  ToastStack,
} from "./components/ui.jsx";
import { useWinnerCelebration } from "./hooks/useWinnerCelebration.js";
import {
  DEFAULT_DURATIONS,
  emptyTournament,
  useTournament,
} from "./hooks/useTournament.js";
import { matctrlPath, matctrlRoutePath } from "./lib/paths.js";
import {
  ACTIONS,
  AVATAR_COLORS,
  BELTS,
  WEIGHTS,
  blankScore,
  decideWinner,
  formatClock,
  formatDate,
  groupRounds,
  initials,
  matchDuration,
  roundCount,
  roundTitle,
} from "./lib/utils.js";
import { getTournamentById, getTournaments } from "./lib/api.js";

function readSessionUser() {
  try {
    return JSON.parse(
      localStorage.getItem("le_user") ||
        localStorage.getItem("lutaedanca_user") ||
        "null",
    );
  } catch {
    return null;
  }
}

function StudioApp() {
  const sessionUser = readSessionUser();
  const [tournament, setTournament, loaded, saveStatus] = useTournament(
    sessionUser?.nombre || "",
  );
  const [tournamentList, setTournamentList] = useState([]);
  const [view, setView] = useState(() =>
    matctrlRoutePath() === "/streams" ? "streams" : "control",
  );
  const [activeId, setActiveId] = useState(
    () =>
      tournament.bouts.find((item) => item.status === "live")?.id ||
      tournament.bouts[0]?.id ||
      null,
  );
  const [remaining, setRemaining] = useState(480);
  const [running, setRunning] = useState(false);
  const [modal, setModal] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [tieBoutId, setTieBoutId] = useState(null);
  const [rosterFilter, setRosterFilter] = useState("all");
  const [notificationsOpen, setNotificationsOpen] = useState(false);
  const [cameraBusy, setCameraBusy] = useState(false);
  const [cameraError, setCameraError] = useState("");
  const [streamTitle, setStreamTitle] = useState("");
  const [confirmState, setConfirmState] = useState(null);
  const [toasts, setToasts] = useState([]);
  const creator = {
    id: String(sessionUser?.id || ""),
    name: sessionUser?.nombre || "",
  };
  const [celebratingId, celebrate] = useWinnerCelebration();
  const studio = useRef(null);
  const toastCounter = useRef(0);

  useEffect(() => {
    function onPopState() {
      setView(matctrlRoutePath() === "/streams" ? "streams" : "control");
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  useEffect(() => {
    if (!tournament.bouts.length) return;
    if (tournament.bouts.some((item) => item.id === activeId)) return;
    setActiveId(
      tournament.bouts.find((item) => item.status === "live")?.id ||
        tournament.bouts[0].id,
    );
  }, [activeId, tournament.bouts]);

  useEffect(() => {
    if (!running) return undefined;
    const timer = window.setInterval(
      () =>
        setRemaining((value) => {
          if (value <= 1) {
            setRunning(false);
            return 0;
          }
          return value - 1;
        }),
      1000,
    );
    return () => window.clearInterval(timer);
  }, [running]);

  const bout =
    tournament.bouts.find((item) => item.id === activeId) ||
    tournament.bouts.find((item) => item.status === "live") ||
    tournament.bouts[0];
  const fighter = (id) => tournament.fighters.find((item) => item.id === id);
  const red = fighter(bout?.redId);
  const blue = fighter(bout?.blueId);
  const completed = tournament.bouts.filter(
    (item) => item.status === "completed",
  ).length;
  const totalRounds = roundCount(tournament.bouts);
  const roundTitleFor = (round) => roundTitle(round, totalRounds);
  const durations = {
    ...DEFAULT_DURATIONS,
    ...(tournament.settings?.durations || {}),
  };
  const duration = matchDuration(
    bout,
    tournament.fighters,
    tournament.settings?.durations,
  );

  useEffect(() => {
    setRunning(false);
    setRemaining(duration);
  }, [activeId, duration]);

  const saveLabel =
    saveStatus === "saved"
      ? "GUARDADO"
      : saveStatus === "saving"
        ? "GUARDANDO"
        : saveStatus === "offline"
          ? "SIN CONEXIÓN"
          : "CONECTANDO";
  const saveTitle =
    saveStatus === "saved"
      ? "Cambios guardados en PostgreSQL"
      : saveStatus === "saving"
        ? "Guardando cambios"
        : saveStatus === "offline"
          ? "Sin conexión con el servidor"
          : "Conectando con el servidor";
  const saveDescription =
    saveStatus === "saved"
      ? "Cambios guardados en PostgreSQL."
      : saveStatus === "saving"
        ? "Guardando cambios…"
        : saveStatus === "offline"
          ? "Sin conexión al servidor; los cambios se conservan en este navegador."
          : "Conectando con PostgreSQL…";

  function notify({ tone = "info", title, message }) {
    const id = ++toastCounter.current;
    setToasts((current) => [...current, { id, tone, title, message }]);
    window.setTimeout(() => {
      setToasts((current) => current.filter((item) => item.id !== id));
    }, 4500);
  }

  function dismissToast(id) {
    setToasts((current) => current.filter((item) => item.id !== id));
  }

  useEffect(() => {
    if (!loaded || !localStorage.getItem("le_token")) return;
    getTournaments()
      .then((data) => {
        if (!Array.isArray(data)) {
          throw new Error("La respuesta de torneos no tiene el formato esperado.");
        }
        setTournamentList(data);
      })
      .catch((error) => {
        notify({
          tone: "error",
          title: "No se pudieron cargar tus torneos",
          message: error instanceof Error ? error.message : "Intenta de nuevo.",
        });
      });
  }, [loaded, tournament.id]);

  async function selectTournament(id) {
    if (!id) return;
    try {
      const selected = await getTournamentById(id);
      setTournament(selected);
      setActiveId(selected.bouts.find((item) => item.status === "live")?.id || selected.bouts[0]?.id || null);
      navigate("control");
    } catch (error) {
      notify({
        tone: "error",
        title: "No se pudo abrir el torneo",
        message: error instanceof Error ? error.message : "Intenta de nuevo.",
      });
    }
  }

  function startNewTournament() {
    setRunning(false);
    studio.current?.stopBroadcast();
    setTournament(emptyTournament(sessionUser?.nombre || ""));
    setActiveId(null);
    setRemaining(300);
    setModal("event");
    navigate("control");
  }

  function navigate(next) {
    setView(next);
    const path = matctrlPath(next === "streams" ? "/streams" : "/");
    if (window.location.pathname !== path) {
      window.history.pushState({}, "", path);
    }
  }

  function changeScore(side, key, amount) {
    if (!bout || bout.status === "completed") return;
    setTournament((current) => ({
      ...current,
      bouts: current.bouts.map((item) => {
        if (item.id !== bout.id) return item;
        const previous = item[side][key];
        return {
          ...item,
          [side]: { ...item[side], [key]: Math.max(0, previous + amount) },
          history: [...(item.history || []), { side, key, previous }],
        };
      }),
    }));
  }

  function undoScore(side) {
    if (!bout || bout.status === "completed") return;
    setTournament((current) => ({
      ...current,
      bouts: current.bouts.map((item) => {
        if (item.id !== bout.id) return item;
        const history = item.history || [];
        const index = history.map((action) => action.side).lastIndexOf(side);
        if (index < 0) return item;
        const action = history[index];
        return {
          ...item,
          [side]: { ...item[side], [action.key]: action.previous },
          history: history.filter(
            (_, historyIndex) => historyIndex !== index,
          ),
        };
      }),
    }));
  }

  function activateBout(id) {
    const selectedBout = tournament.bouts.find((item) => item.id === id);
    if (!selectedBout) return;
    if (selectedBout.status !== "completed") {
      setTournament((current) => ({
        ...current,
        bouts: current.bouts.map((item) => {
          if (item.status === "completed") return item;
          if (item.id === id) return { ...item, status: "live" };
          return item.status === "live" ? { ...item, status: "upcoming" } : item;
        }),
      }));
    }
    setActiveId(id);
  }

  function completeBout(winnerId, boutId = bout?.id) {
    if (!winnerId || !boutId) return;
    const target = tournament.bouts.find((item) => item.id === boutId);
    if (!target) return;
    const winner = fighter(winnerId);
    setTournament((current) => ({
      ...current,
      bouts: current.bouts.map((item) => {
        if (item.id === boutId) {
          return { ...item, status: "completed", winnerId };
        }
        if (
          item.round === target.round + 1 &&
          item.slot === Math.floor(target.slot / 2)
        ) {
          return {
            ...item,
            [target.slot % 2 === 0 ? "redId" : "blueId"]: winnerId,
            status: "upcoming",
          };
        }
        return item;
      }),
    }));
    setRunning(false);
    studio.current?.stopBroadcast({ winnerId });
    celebrate(winnerId);
    notify({
      tone: "success",
      title: "Combate finalizado",
      message: `${winner?.name || "El ganador"} avanza en la llave.`,
    });
    const next = tournament.bouts.find(
      (item) =>
        item.round === target.round + 1 &&
        item.slot === Math.floor(target.slot / 2),
    );
    if (next) setActiveId(next.id);
    setModal(null);
    setTieBoutId(null);
  }

  function finishBout() {
    if (!bout || !red || !blue) {
      notify({
        tone: "error",
        title: "Combate incompleto",
        message: "Ambos peleadores deben estar definidos.",
      });
      return;
    }
    const winner = decideWinner(bout, red.id, blue.id);
    if (!winner) {
      setTieBoutId(bout.id);
      setModal("tie");
      return;
    }
    completeBout(winner, bout.id);
  }

  async function startMatchWithCamera(deviceId) {
    if (!bout || !red || !blue) {
      setCameraError("Define ambos peleadores antes de iniciar el combate.");
      return;
    }
    setCameraBusy(true);
    setCameraError("");
    const result = await studio.current?.startBroadcast(deviceId);
    setCameraBusy(false);
    if (!result?.ok) {
      setCameraError(result?.error || "No se pudo iniciar la cámara.");
      return;
    }
    setModal(null);
    setTournament((current) => ({
      ...current,
      bouts: current.bouts.map((item) => {
        if (item.status === "completed") return item;
        if (item.id === bout.id) return { ...item, status: "live" };
        return item.status === "live" ? { ...item, status: "upcoming" } : item;
      }),
    }));
    setRunning(true);
  }

  function startOrResumeMatch() {
    if (running) {
      setRunning(false);
      return;
    }
    if (studio.current?.state === "live") {
      setRunning(true);
      return;
    }
    if (!red || !blue) {
      notify({
        tone: "error",
        title: "Combate incompleto",
        message: "Define ambos peleadores antes de iniciar.",
      });
      return;
    }
    if (bout?.status === "completed") {
      notify({
        tone: "info",
        title: "Combate finalizado",
        message: "Selecciona otro combate para iniciar.",
      });
      return;
    }
    setCameraError("");
    setModal("camera");
  }

  function registerFighter(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("name") || "").trim();
    if (!name) return;
    const existing = tournament.fighters.find((item) => item.id === editingId);
    const saved = {
      id: existing?.id || crypto.randomUUID(),
      name,
      team:
        String(form.get("team") || "Independiente").trim() || "Independiente",
      belt: String(form.get("belt") || "Blanca"),
      weight: String(form.get("weight") || "-64 kg"),
      initials: initials(name),
      color:
        existing?.color ||
        AVATAR_COLORS[tournament.fighters.length % AVATAR_COLORS.length],
      verified: true,
    };
    setTournament((current) => ({
      ...current,
      fighters: existing
        ? current.fighters.map((item) =>
            item.id === existing.id ? saved : item,
          )
        : [...current.fighters, saved],
    }));
    setEditingId(null);
    setModal(null);
    notify({
      tone: "success",
      title: existing ? "Peleador actualizado" : "Peleador registrado",
      message: saved.name,
    });
  }

  function editFighter(id) {
    setEditingId(id);
    setModal("fighter");
  }

  function deleteFighter(id) {
    const item = fighter(id);
    if (!item) return;
    setConfirmState({
      title: "Eliminar peleador",
      description: `¿Eliminar a ${item.name} del roster? Las llaves conservarán el espacio como pendiente.`,
      confirmLabel: "Eliminar",
      danger: true,
      onConfirm: () => {
        setTournament((current) => ({
          ...current,
          fighters: current.fighters.filter((person) => person.id !== id),
          bouts: current.bouts.map((match) => ({
            ...match,
            redId: match.redId === id ? null : match.redId,
            blueId: match.blueId === id ? null : match.blueId,
            winnerId: match.winnerId === id ? null : match.winnerId,
          })),
        }));
        setConfirmState(null);
        notify({
          tone: "success",
          title: "Peleador eliminado",
          message: item.name,
        });
      },
    });
  }

  function createBracket({ eventName, selected }) {
    if (![2, 4, 8].includes(selected.length)) return;
    const bouts = [];
    let count = selected.length / 2;
    for (let round = 0; round < Math.log2(selected.length); round += 1) {
      for (let slot = 0; slot < count; slot += 1) {
        bouts.push({
          id: crypto.randomUUID(),
          round,
          slot,
          redId: round === 0 ? selected[slot * 2] : null,
          blueId: round === 0 ? selected[slot * 2 + 1] : null,
          red: blankScore(),
          blue: blankScore(),
          status: "upcoming",
          winnerId: null,
          division: { belt: "", weight: "" },
          history: [],
        });
      }
      count /= 2;
    }
    setRunning(false);
    studio.current?.stopBroadcast();
    setTournament((current) => ({ ...current, eventName, bouts }));
    setActiveId(bouts[0].id);
    setRemaining(300);
    setModal(null);
    navigate("brackets");
    notify({
      tone: "success",
      title: "Llave creada",
      message: `${bouts.length} combates generados.`,
    });
  }

  function saveEvent(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("eventName") || "").trim();
    if (!name) return;
    setTournament((current) => ({
      ...current,
      eventName: name,
      location: form.has("location")
        ? String(form.get("location") || "").trim()
        : current.location,
      date: form.has("date")
        ? String(form.get("date") || "")
        : current.date,
      operator: {
        ...(current.operator || {}),
        name: current.operator?.name || sessionUser?.nombre || "",
      },
    }));
    setModal(null);
    notify({
      tone: "success",
      title: "Torneo actualizado",
      message: name,
    });
  }

  function saveSettings(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("eventName") || "").trim();
    if (!name) return;
    const nextDurations = Object.fromEntries(
      BELTS.map((belt) => [
        belt,
        Math.max(1, Number(form.get(`duration-${belt}`)) || 5),
      ]),
    );
    setTournament((current) => ({
      ...current,
      eventName: name,
      location: String(form.get("location") || "").trim(),
      date: String(form.get("date") || ""),
      matCount: Math.max(1, Number(form.get("matCount")) || 1),
      settings: { ...current.settings, durations: nextDurations },
    }));
    setModal(null);
    notify({
      tone: "success",
      title: "Configuración guardada",
      message: "Los cambios se sincronizaron con PostgreSQL.",
    });
  }

  function saveOperator(event) {
    event.preventDefault();
    const form = new FormData(event.currentTarget);
    const name = String(form.get("operatorName") || "").trim();
    if (!name) return;
    setTournament((current) => ({
      ...current,
      operator: {
        name,
        role: String(form.get("operatorRole") || "Árbitro principal").trim(),
      },
    }));
    setModal(null);
    notify({
      tone: "success",
      title: "Operador actualizado",
      message: name,
    });
  }

  const nav = [
    ["control", "Control de mesa", LayoutDashboard],
    ["brackets", "Llaves", ListOrdered],
    ["roster", "Peleadores", UsersRound],
    ["broadcast", "Retransmisión", Radio],
    ["streams", "Directos y VOD", Clapperboard],
  ];
  const title = nav.find(([id]) => id === view)?.[1] || "Configuración";
  const operatorInitials = initials(tournament.operator?.name || "Alex López");

  return (
    <div className="app-shell">
      <aside className="sidebar">
        <button className="brand" onClick={() => navigate("control")}>
          <span className="brand-icon">
            <Activity size={18} />
          </span>
          <span>
            MAT<span>CTRL</span>
          </span>
        </button>
        <div className="side-caption">MIS TORNEOS</div>
        <button className="event-select" onClick={() => setModal("event")}>
          <i />
          <span>
            <strong>{tournament.eventName || "Sin torneo seleccionado"}</strong>
            <small>
              {tournament.id
                ? `Abierto · ${formatDate(tournament.date) || "Sin fecha"}`
                : "Empieza creando uno desde cero"}
            </small>
          </span>
          <ChevronDown size={15} />
        </button>
        <select
          className="tournament-picker"
          aria-label="Seleccionar uno de mis torneos"
          value={tournament.id || ""}
          onChange={(event) => selectTournament(event.target.value)}
        >
          <option value="" disabled>
            {tournament.id ? "Cambiar de torneo" : "Mis torneos guardados"}
          </option>
          {tournamentList.map((item) => (
            <option key={item.id} value={item.id}>
              {item.eventName}
            </option>
          ))}
        </select>
        <button
          className="nav-item new-tournament-button"
          type="button"
          onClick={startNewTournament}
          aria-label="Crear nuevo torneo"
          title="Crear nuevo torneo"
        >
          <Plus size={16} />
          <span>Nuevo torneo</span>
        </button>
        <div className="side-caption nav-caption">OPERACIÓN</div>
        <nav aria-label="Navegación principal">
          {nav.map(([id, label, Icon]) => (
            <button
              key={id}
              className={`nav-item ${view === id ? "active" : ""}`}
              onClick={() => navigate(id)}
              disabled={
                !tournament.id &&
                !["control", "streams", "broadcast"].includes(id)
              }
            >
              <Icon size={17} />
              <span>{label}</span>
              {id === "brackets" && <small>{tournament.bouts.length}</small>}
              {id === "streams" && <small>VOD</small>}
            </button>
          ))}
        </nav>
        <div className="sidebar-bottom">
          <button
            className="mat-status"
            type="button"
            onClick={() => setModal("mat")}
          >
            <i /> Mat 01 conectado
          </button>
          <button
            className={`nav-item ${view === "settings" ? "active" : ""}`}
            onClick={() => navigate("settings")}
          >
            <Settings2 size={17} />
            <span>Configuración</span>
          </button>
          <button
            className="operator"
            type="button"
            onClick={() => setModal("operator")}
            title="Editar operador"
          >
            <span>{operatorInitials}</span>
            <div>
              <strong>{tournament.operator?.name || "Alex López"}</strong>
              <small>
                {tournament.operator?.role || "Árbitro principal"}
              </small>
            </div>
            <ChevronDown size={14} />
          </button>
        </div>
      </aside>

      <main className="workspace">
        <header className="topbar">
          <div className="crumb">
            Torneos <i>/</i> <strong>{title}</strong>
          </div>
          <div className="top-actions">
            <span
              className={`api-status ${saveStatus}`}
              title={saveTitle}
            >
              <i />
              {saveLabel}
            </span>
            <button
              className="rules"
              type="button"
              onClick={() => setModal("help")}
              title="Ver reglamento y puntaje"
            >
              <ShieldCheck size={14} /> REGLAMENTO IBJJF
            </button>
            <button
              className="icon-button"
              aria-label="Ayuda y reglas"
              title="Ayuda y reglas"
              onClick={() => setModal("help")}
            >
              <CircleHelp size={18} />
            </button>
            <button
              className="icon-button has-notice"
              aria-label="Notificaciones"
              title="Notificaciones"
              onClick={() => setNotificationsOpen((open) => !open)}
            >
              <Bell size={18} />
            </button>
            <i className="top-divider" />
            <span className="date-label">
              {formatDate(tournament.date || new Date())}
            </span>
          </div>
          {notificationsOpen && (
            <div className="notice-popover">
              <strong>Estado del torneo</strong>
              <span>
                <i />{" "}
                {saveStatus === "offline"
                  ? "API Node sin conexión"
                  : "API Node conectada"}
              </span>
              <span>
                <i /> {tournament.bouts.length} combates en la llave
              </span>
              <span>
                <i /> {tournament.fighters.length} peleadores registrados
              </span>
              <button onClick={() => setNotificationsOpen(false)}>
                Cerrar
              </button>
            </div>
          )}
        </header>

        {view === "control" && !tournament.id && (
          <div className="page-content">
            <section className="lower-panel event-panel">
              <div className="eyebrow">TU ESPACIO DE TORNEOS</div>
              <h1>Empieza desde cero</h1>
              <p>
                Crea tu torneo, registra peleadores y arma las llaves. No hay
                eventos de ejemplo ni datos precargados en tu cuenta.
              </p>
              <button
                className="button primary"
                type="button"
                onClick={() => setModal("event")}
              >
                <Plus size={16} /> Crear mi primer torneo
              </button>
            </section>
          </div>
        )}

        {view === "control" && tournament.id && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">
                  JORNADA 01 <i>·</i>{" "}
                  {bout?.division?.belt || red?.belt || "ADULTOS"} <i>·</i>{" "}
                  {bout?.division?.weight || red?.weight || "-76 KG"}
                </div>
                <h1>Control de mesa</h1>
                <p>
                  Supervisa el combate y registra cada acción en tiempo real.
                </p>
              </div>
              <button
                className="button secondary"
                onClick={() => navigate("broadcast")}
              >
                <Video size={16} /> Ver retransmisión
              </button>
            </div>

            <div className="control-grid">
              <section className="match-panel">
                <div className="match-header">
                  <span className="live-pill">
                    <i />{" "}
                    {bout?.status === "completed"
                      ? "FINALIZADO"
                      : bout?.status === "live"
                        ? "EN COMBATE"
                        : "PENDIENTE"}
                  </span>
                  <span>
                    MAT 01 <i>·</i>{" "}
                    {bout ? roundTitleFor(bout.round) : "SIN COMBATE"}
                  </span>
                  <ActionMenu
                    label="Opciones del combate"
                    items={[
                      {
                        label: "Editar torneo",
                        icon: Pencil,
                        onClick: () => setModal("event"),
                      },
                      {
                        label: "Abrir llaves",
                        icon: ListOrdered,
                        onClick: () => navigate("brackets"),
                      },
                      {
                        label: "Ver retransmisión",
                        icon: Radio,
                        onClick: () => navigate("broadcast"),
                      },
                      { separator: true },
                      {
                        label: "Reiniciar cronómetro",
                        icon: RotateCcw,
                        onClick: () => {
                          setRunning(false);
                          setRemaining(duration);
                        },
                      },
                    ]}
                  />
                </div>

                <div className="athlete-row">
                  <Athlete
                    item={red}
                    side="red"
                    values={bout?.red || blankScore()}
                    celebrating={celebratingId === red?.id}
                  />
                  <div className="clock">
                    <span className="versus">VS</span>
                    <strong className={remaining <= 30 ? "urgent" : ""}>
                      {formatClock(remaining)}
                    </strong>
                    <small>TIEMPO DE COMBATE</small>
                    <div>
                      <button
                        className="clock-play"
                        aria-label={
                          running ? "Pausar combate" : "Iniciar combate"
                        }
                        title={
                          running
                            ? "Pausar combate"
                            : "Iniciar combate y elegir cámara"
                        }
                        onClick={startOrResumeMatch}
                        disabled={bout?.status === "completed"}
                      >
                        {running ? (
                          <Pause size={15} />
                        ) : (
                          <Play size={15} fill="currentColor" />
                        )}
                      </button>
                      <button
                        aria-label="Reiniciar cronómetro"
                        onClick={() => {
                          setRunning(false);
                          setRemaining(duration);
                        }}
                      >
                        <RotateCcw size={14} />
                      </button>
                    </div>
                  </div>
                  <Athlete
                    item={blue}
                    side="blue"
                    values={bout?.blue || blankScore()}
                    celebrating={celebratingId === blue?.id}
                  />
                </div>

                <div className="score-area">
                  {["red", "blue"].map((side) => (
                    <div className={`score-controls ${side}`} key={side}>
                      <div className="score-controls-head">
                        <strong>
                          PUNTOS {side === "red" ? "ROJO" : "AZUL"}
                        </strong>
                        <button
                          onClick={() => undoScore(side)}
                          disabled={
                            bout?.status === "completed" ||
                            !(bout?.history || []).some(
                              (action) => action.side === side,
                            )
                          }
                        >
                          <RotateCcw size={12} /> Deshacer
                        </button>
                      </div>
                      <div className="score-buttons">
                        {ACTIONS.map(([label, value]) => (
                          <button
                            key={label}
                            onClick={() => changeScore(side, "points", value)}
                            disabled={bout?.status === "completed"}
                          >
                            <b>+{value}</b>
                            <span>{label}</span>
                          </button>
                        ))}
                      </div>
                      <div className="penalty-row">
                        <button
                          onClick={() => changeScore(side, "advantages", 1)}
                          disabled={bout?.status === "completed"}
                        >
                          <Plus size={13} /> Ventaja
                        </button>
                        <button
                          onClick={() => changeScore(side, "penalties", 1)}
                          disabled={bout?.status === "completed"}
                        >
                          <Flag size={13} /> Penalización
                        </button>
                      </div>
                    </div>
                  ))}
                </div>

                <div className="match-footer">
                  <span>
                    <Clock3 size={14} /> Reglas IBJJF · {duration / 60} min
                  </span>
                  <button
                    onClick={finishBout}
                    disabled={!bout || bout.status === "completed"}
                  >
                    <Square size={12} fill="currentColor" /> Finalizar combate{" "}
                    <ArrowRight size={14} />
                  </button>
                </div>
              </section>

              <aside className="queue-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">EN ESPERA</div>
                    <h2>Próximos combates</h2>
                  </div>
                  <button
                    className="inline-link"
                    onClick={() => navigate("brackets")}
                  >
                    Ver llaves <ArrowRight size={13} />
                  </button>
                </div>
                <div className="queue-list">
                  {tournament.bouts
                    .filter(
                      (item) =>
                        item.status !== "completed" && item.id !== bout?.id,
                    )
                    .slice(0, 3)
                    .map((item, index) => (
                      <button
                        className="queue-item"
                        key={item.id}
                        onClick={() => activateBout(item.id)}
                      >
                        <span className="queue-number">0{index + 1}</span>
                        <span>
                          <strong>
                            {fighter(item.redId)?.name || "Clasificado"}{" "}
                            <i>vs</i>{" "}
                            {fighter(item.blueId)?.name || "Clasificado"}
                          </strong>
                          <small>
                            {roundTitleFor(item.round)} ·{" "}
                            {item.division?.weight || "-76 kg"}
                          </small>
                        </span>
                        <small>
                          {item.status === "live" ? "EN VIVO" : "SIGUIENTE"}
                        </small>
                      </button>
                    ))}
                  {tournament.bouts.every(
                    (item) =>
                      item.status === "completed" || item.id === bout?.id,
                  ) && (
                    <p className="empty-state">No hay combates pendientes.</p>
                  )}
                </div>
                <div className="queue-summary">
                  <span>
                    <Flag size={15} />
                  </span>
                  <div>
                    <strong>
                      {completed} de {tournament.bouts.length} combates
                    </strong>
                    <small>completados en este torneo</small>
                  </div>
                  <b>
                    {Math.round(
                      (completed / Math.max(tournament.bouts.length, 1)) * 100,
                    )}
                    <small>%</small>
                  </b>
                </div>
              </aside>
            </div>

            <div className="lower-grid">
              <section className="lower-panel">
                <div className="panel-heading">
                  <div>
                    <div className="eyebrow">VISTA RÁPIDA</div>
                    <h2>Llave · {tournament.eventName}</h2>
                  </div>
                  <button
                    className="inline-link"
                    onClick={() => navigate("brackets")}
                  >
                    Abrir llave <ArrowRight size={13} />
                  </button>
                </div>
                <div className="mini-bracket">
                  {groupRounds(tournament.bouts).map(([round, matches]) => (
                    <div className="mini-round" key={round}>
                      <small>{roundTitleFor(round)}</small>
                      {matches.slice(0, 2).map((item) => (
                        <button
                          key={item.id}
                          onClick={() => {
                            activateBout(item.id);
                            navigate("control");
                          }}
                        >
                          <span>
                            {fighter(item.redId)?.name || "Por definir"}{" "}
                            <b>{item.red.points}</b>
                          </span>
                          <span>
                            {fighter(item.blueId)?.name || "Por definir"}{" "}
                            <b>{item.blue.points}</b>
                          </span>
                          <i>
                            {item.status === "live"
                              ? "EN VIVO"
                              : item.status === "completed"
                                ? "FINAL"
                                : "PENDIENTE"}
                          </i>
                        </button>
                      ))}
                    </div>
                  ))}
                </div>
              </section>
              <section className="lower-panel event-panel">
                <div className="eyebrow">DATOS DEL EVENTO</div>
                <h2>{tournament.eventName}</h2>
                <div className="event-numbers">
                  <div>
                    <strong>{tournament.fighters.length}</strong>
                    <small>Peleadores</small>
                  </div>
                  <div>
                    <strong>{tournament.bouts.length}</strong>
                    <small>Combates</small>
                  </div>
                  <div>
                    <strong>{tournament.matCount || 1}</strong>
                    <small>Área activa</small>
                  </div>
                </div>
                <button
                  className="inline-link"
                  onClick={() => navigate("roster")}
                >
                  Administrar peleadores <ArrowRight size={13} />
                </button>
              </section>
            </div>
          </div>
        )}

        {view === "brackets" && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">CUADRO DE ELIMINACIÓN</div>
                <h1>Llaves del torneo</h1>
                <p>
                  Selecciona un combate para abrirlo en la mesa de control.
                </p>
              </div>
              <button
                className="button primary"
                onClick={() => setModal("bracket")}
              >
                <Plus size={16} /> Crear llave
              </button>
            </div>
            <div className="bracket-toolbar">
              <span>
                <Award size={16} /> {tournament.eventName}
              </span>
              <small>
                <i /> {completed} / {tournament.bouts.length} combates
                completados
              </small>
            </div>
            <div className="bracket-board">
              {tournament.bouts.length ? (
                groupRounds(tournament.bouts).map(([round, matches]) => (
                  <section className="bracket-round" key={round}>
                    <div>
                      <strong>{roundTitleFor(round)}</strong>
                      <small>
                        {matches.length}{" "}
                        {matches.length === 1 ? "combate" : "combates"}
                      </small>
                    </div>
                    <div className={`bracket-matches round-${round}`}>
                      {matches.map((item) => (
                        <button
                          className={`bracket-bout ${
                            item.id === activeId ? "selected" : ""
                          }`}
                          key={item.id}
                          onClick={() => {
                            activateBout(item.id);
                            navigate("control");
                          }}
                        >
                          <small>
                            {item.status === "live"
                              ? "● EN COMBATE"
                              : item.status === "completed"
                                ? "FINALIZADO"
                                : "PENDIENTE"}{" "}
                            <i>MAT 01</i>
                          </small>
                          <FighterRow
                            item={fighter(item.redId)}
                            score={item.red.points}
                            winner={
                              item.winnerId === item.redId && !!item.winnerId
                            }
                            celebrating={celebratingId === item.redId}
                          />
                          <FighterRow
                            item={fighter(item.blueId)}
                            score={item.blue.points}
                            winner={
                              item.winnerId === item.blueId && !!item.winnerId
                            }
                            celebrating={celebratingId === item.blueId}
                          />
                          <span className="open-bout">
                            Abrir en mesa <ArrowRight size={12} />
                          </span>
                        </button>
                      ))}
                    </div>
                  </section>
                ))
              ) : (
                <p className="empty-state">
                  Crea una llave para comenzar el torneo.
                </p>
              )}
            </div>
          </div>
        )}

        {view === "roster" && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">REGISTRO DEL EVENTO</div>
                <h1>Peleadores</h1>
                <p>Administra participantes, academias y divisiones.</p>
              </div>
              <button
                className="button primary"
                onClick={() => {
                  setEditingId(null);
                  setModal("fighter");
                }}
              >
                <Plus size={16} /> Registrar peleador
              </button>
            </div>
            <div className="roster-toolbar">
              <span>
                <UsersRound size={16} />{" "}
                {
                  tournament.fighters.filter(
                    (item) =>
                      rosterFilter === "all" || item.weight === rosterFilter,
                  ).length
                }{" "}
                participantes registrados
              </span>
              <label>
                División
                <select
                  value={rosterFilter}
                  onChange={(event) => setRosterFilter(event.target.value)}
                >
                  <option value="all">Todas las divisiones</option>
                  {[
                    ...new Set(tournament.fighters.map((item) => item.weight)),
                  ].map((weight) => (
                    <option key={weight}>{weight}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="table-wrap">
              <table>
                <thead>
                  <tr>
                    <th>PELEADOR</th>
                    <th>ACADEMIA</th>
                    <th>CINTURÓN</th>
                    <th>DIVISIÓN</th>
                    <th>ESTADO</th>
                    <th>ACCIONES</th>
                  </tr>
                </thead>
                <tbody>
                  {tournament.fighters
                    .filter(
                      (item) =>
                        rosterFilter === "all" || item.weight === rosterFilter,
                    )
                    .map((item) => (
                      <tr key={item.id}>
                        <td>
                          <FighterRow item={item} />
                        </td>
                        <td>{item.team}</td>
                        <td>
                          <span className="belt-tag">{item.belt}</span>
                        </td>
                        <td>{item.weight}</td>
                        <td>
                          <span className="verified">
                            <Check size={12} /> Verificado
                          </span>
                        </td>
                        <td>
                          <div className="row-actions">
                            <button
                              title={`Editar ${item.name}`}
                              aria-label={`Editar ${item.name}`}
                              onClick={() => editFighter(item.id)}
                            >
                              <Pencil size={14} />
                            </button>
                            <button
                              title={`Eliminar ${item.name}`}
                              aria-label={`Eliminar ${item.name}`}
                              onClick={() => deleteFighter(item.id)}
                            >
                              <Trash2 size={14} />
                            </button>
                          </div>
                        </td>
                      </tr>
                    ))}
                </tbody>
              </table>
            </div>
          </div>
        )}

        <div
          className="page-content live-broadcast-page"
          hidden={view !== "broadcast"}
        >
          <div className="page-heading">
            <div>
              <div className="eyebrow">SEÑAL DEL MAT 01</div>
              <h1>Retransmisión</h1>
              <p>
                Emite desde una cámara conectada y comparte el enlace en vivo.
              </p>
            </div>
          </div>
          <label className="stream-creator-label">
            Título del directo
            <input
              value={streamTitle}
              onChange={(event) => setStreamTitle(event.target.value)}
              maxLength={140}
              placeholder={
                tournament.eventName || "Ej. Entrenamiento en vivo"
              }
            />
          </label>
          <LiveStudio
            ref={studio}
            roomId="mat-01"
            tournament={tournament}
            bout={bout}
            red={red}
            blue={blue}
            remaining={remaining}
            running={running}
            eventName={streamTitle.trim() || tournament.eventName}
            roundLabel={bout ? roundTitleFor(bout.round) : ""}
            onToast={notify}
          />
        </div>

        {view === "streams" && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">BIBLIOTECA</div>
                <h1>Directos y VOD</h1>
                <p>
                  Consulta emisiones activas y grabaciones guardadas en el
                  servidor.
                </p>
              </div>
              <div className="heading-actions">
                <a className="button secondary" href={matctrlPath("/vods")} target="_blank">
                  <Clapperboard size={16} /> Biblioteca pública
                </a>
                <button
                  className="button secondary"
                  onClick={() => navigate("broadcast")}
                >
                  <Radio size={16} /> Ir a retransmisión
                </button>
              </div>
            </div>
            <StreamsView
              onToast={notify}
              creator={creator}
            />
          </div>
        )}

        {view === "settings" && (
          <div className="page-content">
            <div className="page-heading">
              <div>
                <div className="eyebrow">PREFERENCIAS</div>
                <h1>Configuración</h1>
                <p>Reglamento, duración y datos del torneo.</p>
              </div>
              <button
                className="button primary"
                onClick={() => setModal("settings")}
              >
                <Settings2 size={16} /> Editar configuración
              </button>
            </div>
            <section className="settings-panel">
              <div>
                <span>
                  <strong>Reglamento activo</strong>
                  <small>Reglas IBJJF · Adultos</small>
                </span>
                <b className="rules">
                  <ShieldCheck size={14} /> ACTIVO
                </b>
              </div>
              <div>
                <span>
                  <strong>Duración estándar</strong>
                  <small>
                    {Object.entries(durations)
                      .map(([belt, minutes]) => `${belt} ${minutes}m`)
                      .join(" · ")}
                  </small>
                </span>
                <b>
                  {Math.min(...Object.values(durations))}–
                  {Math.max(...Object.values(durations))} min
                </b>
              </div>
              <div>
                <span>
                  <strong>Puntuación</strong>
                  <small>
                    Derribo / barrido / rodilla al vientre / pase / montada /
                    espalda
                  </small>
                </span>
                <b>2 · 3 · 4 pts</b>
              </div>
              <div>
                <span>
                  <strong>Evento</strong>
                  <small>
                    {tournament.location || "Sin sede"} ·{" "}
                    {formatDate(tournament.date) || "Sin fecha"}
                  </small>
                </span>
                <b>{tournament.matCount || 1} mat</b>
              </div>
              <div>
                <span>
                  <strong>Datos del torneo</strong>
                  <small>{saveDescription}</small>
                </span>
                <span className={`api-status ${saveStatus}`}>
                  <i />
                  {saveStatus === "saved"
                    ? "API conectada"
                    : saveStatus === "saving"
                      ? "Guardando"
                      : saveStatus === "offline"
                        ? "Sin conexión"
                        : "Conectando"}
                </span>
              </div>
            </section>
          </div>
        )}

        <footer className="app-footer">
          <span>
            MATCTRL <i /> Herramienta de operación para grappling
          </span>
          <span>v0.2 · PostgreSQL + MediaMTX</span>
        </footer>
      </main>

      {modal === "camera" && (
        <CameraPicker
          busy={cameraBusy}
          error={cameraError}
          onCancel={() => setModal(null)}
          onStart={startMatchWithCamera}
        />
      )}

      {modal === "bracket" && (
        <TournamentWizard
          tournament={tournament}
          initialSelected={tournament.fighters
            .slice(0, 4)
            .map((item) => item.id)}
          onClose={() => setModal(null)}
          onCreate={createBracket}
        />
      )}

      {modal === "fighter" && (
        <Modal
          title={editingId ? "Editar peleador" : "Registrar peleador"}
          description={
            editingId
              ? "Actualiza los datos del participante."
              : "Añade un participante al roster del torneo."
          }
          onClose={() => {
            setModal(null);
            setEditingId(null);
          }}
        >
          <form className="modal-form" onSubmit={registerFighter}>
            <label>
              Nombre completo
              <input
                name="name"
                required
                autoFocus
                defaultValue={
                  tournament.fighters.find((item) => item.id === editingId)
                    ?.name || ""
                }
                placeholder="Ej. Diego Ramírez"
              />
            </label>
            <label>
              Academia
              <input
                name="team"
                defaultValue={
                  tournament.fighters.find((item) => item.id === editingId)
                    ?.team || ""
                }
                placeholder="Nombre de la academia"
              />
            </label>
            <div className="form-pair">
              <label>
                Cinturón
                <select
                  name="belt"
                  defaultValue={
                    tournament.fighters.find((item) => item.id === editingId)
                      ?.belt || "Blanca"
                  }
                >
                  {BELTS.map((belt) => (
                    <option key={belt}>{belt}</option>
                  ))}
                </select>
              </label>
              <label>
                Peso
                <select
                  name="weight"
                  defaultValue={
                    tournament.fighters.find((item) => item.id === editingId)
                      ?.weight || "-64 kg"
                  }
                >
                  {WEIGHTS.map((weight) => (
                    <option key={weight}>{weight}</option>
                  ))}
                </select>
              </label>
            </div>
            <div className="modal-actions">
              <button
                type="button"
                onClick={() => {
                  setModal(null);
                  setEditingId(null);
                }}
              >
                Cancelar
              </button>
              <button className="button primary">
                {editingId ? (
                  <>
                    <Check size={14} /> Guardar cambios
                  </>
                ) : (
                  <>
                    <Plus size={14} /> Registrar
                  </>
                )}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "event" && (
        <Modal
          title={tournament.id ? "Editar torneo" : "Crear torneo desde cero"}
          description={
            tournament.id
              ? "Actualiza el nombre que verán operadores y espectadores."
              : "Define los datos iniciales. Peleadores y llaves se agregarán después."
          }
          onClose={() => setModal(null)}
        >
          <form className="modal-form" onSubmit={saveEvent}>
            <label>
              Nombre del torneo
              <input
                name="eventName"
                required
                defaultValue={tournament.eventName}
                autoFocus
              />
            </label>
            {!tournament.id && (
              <>
                <label>
                  Sede
                  <input name="location" placeholder="Gimnasio / ciudad" />
                </label>
                <label>
                  Fecha
                  <input name="date" type="date" />
                </label>
              </>
            )}
            <div className="modal-actions">
              <button type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="button primary">
                <Check size={14} /> {tournament.id ? "Guardar" : "Crear torneo"}
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "operator" && (
        <Modal
          title="Operador de mesa"
          description="Estos datos identifican a quien opera el torneo."
          onClose={() => setModal(null)}
        >
          <form className="modal-form" onSubmit={saveOperator}>
            <label>
              Nombre
              <input
                name="operatorName"
                required
                autoFocus
                defaultValue={tournament.operator?.name || ""}
              />
            </label>
            <label>
              Rol
              <select
                name="operatorRole"
                defaultValue={tournament.operator?.role || "Árbitro principal"}
              >
                <option>Árbitro principal</option>
                <option>Árbitro de mesa</option>
                <option>Anotador</option>
                <option>Productor</option>
              </select>
            </label>
            <div className="modal-actions">
              <button type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="button primary">
                <Check size={14} /> Guardar operador
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "mat" && (
        <Modal
          title="Estado del Mat 01"
          description="Resumen operativo del área activa."
          onClose={() => setModal(null)}
        >
          <div className="help-content">
            <div>
              <span>Servidor</span>
              <strong>{saveDescription}</strong>
            </div>
            <div>
              <span>Combates</span>
              <strong>
                {completed} / {tournament.bouts.length} completados
              </strong>
            </div>
            <div>
              <span>Peleadores</span>
              <strong>{tournament.fighters.length} registrados</strong>
            </div>
            <div>
              <span>Evento</span>
              <strong>{tournament.eventName}</strong>
            </div>
          </div>
          <div className="modal-actions">
            <button type="button" onClick={() => setModal(null)}>
              Cerrar
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => {
                setModal(null);
                navigate("broadcast");
              }}
            >
              <Radio size={14} /> Abrir retransmisión
            </button>
          </div>
        </Modal>
      )}

      {modal === "help" && (
        <Modal
          title="Reglas de puntaje"
          description="Referencia rápida para el control IBJJF."
          onClose={() => setModal(null)}
        >
          <div className="help-content">
            {ACTIONS.map(([label, value]) => (
              <div key={label}>
                <span>{label}</span>
                <strong>{value} puntos</strong>
              </div>
            ))}
            <div>
              <span>Ventaja</span>
              <strong>Desempate</strong>
            </div>
            <div>
              <span>Penalización</span>
              <strong>Desempate</strong>
            </div>
          </div>
        </Modal>
      )}

      {modal === "settings" && (
        <Modal
          title="Configuración del torneo"
          description="Estos datos se guardan en PostgreSQL junto al torneo."
          onClose={() => setModal(null)}
        >
          <form className="modal-form" onSubmit={saveSettings}>
            <label>
              Nombre del torneo
              <input
                name="eventName"
                required
                defaultValue={tournament.eventName}
                autoFocus
              />
            </label>
            <div className="form-pair">
              <label>
                Sede
                <input
                  name="location"
                  defaultValue={tournament.location || ""}
                  placeholder="Gimnasio / ciudad"
                />
              </label>
              <label>
                Fecha
                <input
                  name="date"
                  type="date"
                  defaultValue={tournament.date || ""}
                />
              </label>
            </div>
            <label>
              Áreas activas
              <input
                name="matCount"
                type="number"
                min="1"
                max="12"
                defaultValue={tournament.matCount || 1}
              />
            </label>
            <strong className="picker-count">
              Duración por cinturón (minutos)
            </strong>
            <div className="settings-grid">
              {BELTS.map((belt) => (
                <label key={belt}>
                  {belt}
                  <input
                    name={`duration-${belt}`}
                    type="number"
                    min="1"
                    max="30"
                    defaultValue={durations[belt]}
                  />
                </label>
              ))}
            </div>
            <div className="modal-actions">
              <button type="button" onClick={() => setModal(null)}>
                Cancelar
              </button>
              <button className="button primary">
                <Check size={14} /> Guardar configuración
              </button>
            </div>
          </form>
        </Modal>
      )}

      {modal === "tie" && (
        <Modal
          title="Combate empatado"
          description="El puntaje está igualado. Elige al ganador por decisión arbitral."
          onClose={() => {
            setModal(null);
            setTieBoutId(null);
          }}
        >
          <div className="modal-actions">
            <button
              type="button"
              onClick={() => {
                setModal(null);
                setTieBoutId(null);
              }}
            >
              Cancelar
            </button>
            <button
              className="button secondary"
              type="button"
              onClick={() => completeBout(blue?.id, tieBoutId)}
            >
              Gana {blue?.name || "Azul"}
            </button>
            <button
              className="button primary"
              type="button"
              onClick={() => completeBout(red?.id, tieBoutId)}
            >
              Gana {red?.name || "Rojo"}
            </button>
          </div>
        </Modal>
      )}

      {confirmState && (
        <ConfirmDialog
          title={confirmState.title}
          description={confirmState.description}
          confirmLabel={confirmState.confirmLabel}
          danger={confirmState.danger}
          onConfirm={confirmState.onConfirm}
          onCancel={() => setConfirmState(null)}
        />
      )}

      <ToastStack toasts={toasts} onDismiss={dismissToast} />
    </div>
  );
}

function App() {
  const routePath = matctrlRoutePath();
  const scoreMatch = routePath.match(/^\/score\/([^/]+)\/?$/);
  if (scoreMatch) {
    return <ScoreViewer roomId={decodeURIComponent(scoreMatch[1])} />;
  }
  const liveMatch = routePath.match(/^\/live\/([^/]+)\/?$/);
  if (liveMatch) {
    return <LiveViewer streamId={decodeURIComponent(liveMatch[1])} />;
  }
  const vodMatch = routePath.match(/^\/vod\/([^/]+)\/?$/);
  if (vodMatch) {
    return <VodViewer streamId={decodeURIComponent(vodMatch[1])} />;
  }
  if (routePath === "/vods") {
    return <VodLibraryView />;
  }
  if (!localStorage.getItem("le_token")) {
    return (
      <main className="page-content">
        <section className="lower-panel event-panel">
          <div className="eyebrow">CUENTA LUTA · DANÇA</div>
          <h1>Inicia sesión para usar MATCTRL</h1>
          <p>
            Tus torneos, emisiones y repeticiones quedan asociados a tu cuenta
            de la plataforma.
          </p>
          <a className="button primary" href="/login.html">
            Iniciar sesión
          </a>
        </section>
      </main>
    );
  }
  return <StudioApp />;
}

function Athlete({ item, side, values, celebrating = false }) {
  return (
    <div
      className={`athlete athlete-${side} ${
        celebrating ? "winner-celebrating" : ""
      }`}
    >
      <div className="athlete-line" />
      <div className="athlete-meta-top">
        <b>{side === "red" ? "ROJO" : "AZUL"}</b>
        <span>{item?.belt || "—"}</span>
      </div>
      <Avatar item={item || { initials: "?", color: "neutral" }} large />
      <h2>{item?.name || "Por definir"}</h2>
      <p>{item?.team || "Esperando clasificado"}</p>
      <strong className="score-number">{values.points}</strong>
      <div className="athlete-tiebreak">
        <span>
          <b>{values.advantages}</b> ventaja{values.advantages === 1 ? "" : "s"}
        </span>
        <i />
        <span>
          <b>{values.penalties}</b> penaliz.
        </span>
      </div>
    </div>
  );
}

function FighterRow({ item, winner = false, score, celebrating = false }) {
  return (
    <span
      className={`fighter-row ${celebrating ? "winner-celebrating" : ""}`}
    >
      <Avatar item={item || { initials: "—", color: "neutral" }} />
      <span>
        {item?.name || "Por definir"}
        <small>{item?.team || "Clasificado pendiente"}</small>
      </span>
      {winner ? (
        <Check size={14} />
      ) : score !== undefined ? (
        <b>{score}</b>
      ) : null}
    </span>
  );
}

export default App;
