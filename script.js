// Paste your Google Sheet CSV export URL here.
// Example:
// https://docs.google.com/spreadsheets/d/1K9LYi0S6wBGqj6JgWdEtBzYTR507Z2GRHXpDVyA9q2Q/export?format=csv&gid=0
const GOOGLE_SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1K9LYi0S6wBGqj6JgWdEtBzYTR507Z2GRHXpDVyA9q2Q/edit?gid=1993678244#gid=1993678244";

const state = {
  rows: [],
  weeks: [],
  referenceWeek: "",
  board: "ALL",
  subject: "ALL",
  search: "",
  view: "expanded"
};

const $ = (id) => document.getElementById(id);

document.addEventListener("DOMContentLoaded", () => {
  $("refreshBtn").addEventListener("click", loadData);
  $("weekFilter").addEventListener("change", (e) => {
    state.referenceWeek = e.target.value;
    render();
  });
  $("boardFilter").addEventListener("change", (e) => {
    state.board = e.target.value;
    populateSubjectFilter();
    render();
  });
  $("subjectFilter").addEventListener("change", (e) => {
    state.subject = e.target.value;
    render();
  });
  $("titleSearch").addEventListener("input", (e) => {
    state.search = e.target.value.toLowerCase().trim();
    render();
  });
  $("viewFilter").addEventListener("change", (e) => {
    state.view = e.target.value;
    render();
  });

  loadData();
});

async function loadData() {
  showLoading(true);
  hideError();

  if (!GOOGLE_SHEET_CSV_URL || GOOGLE_SHEET_CSV_URL.includes("YOUR_GOOGLE")) {
    showError(
      "Google Sheet CSV URL add nahi kiya hai.\n\n" +
      "script.js me GOOGLE_SHEET_CSV_URL ke andar apna Google Sheet CSV URL paste karein."
    );
    showLoading(false);
    return;
  }

  try {
    const url =
      GOOGLE_SHEET_CSV_URL +
      (GOOGLE_SHEET_CSV_URL.includes("?") ? "&" : "?") +
      "_ts=" +
      Date.now();

    const response = await fetch(url, { cache: "no-store" });

    if (!response.ok) {
      throw new Error(`Google Sheet request failed: HTTP ${response.status}`);
    }

    const csvText = await response.text();
    const parsed = parseCSV(csvText);

    if (!parsed.length) {
      throw new Error("Google Sheet se koi data nahi mila.");
    }

    const headers = parsed[0].map((h) => cleanHeader(h));

    const required = [
      "rating_date",
      "rating",
      "title",
      "Board Name",
      "Subject Name"
    ];

    const missing = required.filter((h) => !headers.includes(h));

    if (missing.length) {
      throw new Error(
        "Required columns missing: " +
        missing.join(", ") +
        "\n\nHeaders found:\n" +
        headers.join(" | ")
      );
    }

    state.rows = parsed
      .slice(1)
      .map((row) => {
        const obj = {};
        headers.forEach((h, i) => {
          obj[h] = row[i] ?? "";
        });

        const date = parseDate(obj["rating_date"]);
        const rating = Number(obj["rating"]);

        if (!date || !Number.isFinite(rating)) return null;

        return {
          date,
          week: getMonday(date),
          rating,
          title: String(obj["title"] || "Untitled").trim(),
          board: String(obj["Board Name"] || "Unknown").trim(),
          subject: String(obj["Subject Name"] || "Unknown").trim()
        };
      })
      .filter(Boolean);

    if (!state.rows.length) {
      throw new Error("Valid rating rows nahi mile.");
    }

    state.weeks = [...new Set(state.rows.map((r) => r.week))].sort().reverse();
    state.referenceWeek = state.weeks[0] || "";

    populateWeekFilter();
    populateBoardFilter();
    populateSubjectFilter();
    render();
  } catch (error) {
    console.error(error);
    showError(
      "Data load nahi ho paya.\n\n" +
      (error?.message || String(error)) +
      "\n\nCheck karein:\n" +
      "1. Google Sheet public/published hai.\n" +
      "2. CSV URL sahi hai.\n" +
      "3. Header names exactly match kar rahe hain."
    );
  } finally {
    showLoading(false);
  }
}

function cleanHeader(value) {
  return String(value || "").replace(/^\uFEFF/, "").trim();
}

function parseCSV(text) {
  const rows = [];
  let row = [];
  let cell = "";
  let quoted = false;

  for (let i = 0; i < text.length; i++) {
    const char = text[i];
    const next = text[i + 1];

    if (char === '"' && quoted && next === '"') {
      cell += '"';
      i++;
    } else if (char === '"') {
      quoted = !quoted;
    } else if (char === "," && !quoted) {
      row.push(cell);
      cell = "";
    } else if ((char === "\n" || char === "\r") && !quoted) {
      if (char === "\r" && next === "\n") i++;
      row.push(cell);
      if (row.some((v) => String(v).trim() !== "")) rows.push(row);
      row = [];
      cell = "";
    } else {
      cell += char;
    }
  }

  if (cell !== "" || row.length) {
    row.push(cell);
    if (row.some((v) => String(v).trim() !== "")) rows.push(row);
  }

  return rows;
}

function parseDate(value) {
  if (!value) return null;

  const s = String(value).trim();

  let match = s.match(/^(\d{4})-(\d{1,2})-(\d{1,2})/);
  if (match) {
    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );
  }

  const d = new Date(s);
  return Number.isNaN(d.getTime())
    ? null
    : new Date(d.getFullYear(), d.getMonth(), d.getDate());
}

function getMonday(date) {
  const d = new Date(date);
  const day = d.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  d.setDate(d.getDate() + diff);
  return formatDate(d);
}

function dateFromWeek(week) {
  const [y, m, d] = week.split("-").map(Number);
  return new Date(y, m - 1, d);
}

function addDays(date, days) {
  const d = new Date(date);
  d.setDate(d.getDate() + days);
  return d;
}

function formatDate(date) {
  const y = date.getFullYear();
  const m = String(date.getMonth() + 1).padStart(2, "0");
  const d = String(date.getDate()).padStart(2, "0");
  return `${y}-${m}-${d}`;
}

function formatWeekLabel(week) {
  const start = dateFromWeek(week);
  const end = addDays(start, 6);

  return `${formatDisplayDate(start)} – ${formatDisplayDate(end)}`;
}

function formatDisplayDate(date) {
  return date.toLocaleDateString("en-IN", {
    day: "2-digit",
    month: "short",
    year: "numeric"
  });
}

function populateWeekFilter() {
  $("weekFilter").innerHTML = state.weeks
    .map(
      (week) =>
        `<option value="${escapeHtml(week)}" ${
          week === state.referenceWeek ? "selected" : ""
        }>${escapeHtml(formatWeekLabel(week))}</option>`
    )
    .join("");
}

function populateBoardFilter() {
  const boards = [...new Set(state.rows.map((r) => r.board))]
    .sort((a, b) => a.localeCompare(b));

  $("boardFilter").innerHTML =
    `<option value="ALL">All Boards</option>` +
    boards
      .map(
        (board) =>
          `<option value="${escapeHtml(board)}">${escapeHtml(board)}</option>`
      )
      .join("");

  $("boardFilter").value = boards.includes(state.board) ? state.board : "ALL";
  if (!boards.includes(state.board)) state.board = "ALL";
}

function populateSubjectFilter() {
  const subjects = [
    ...new Set(
      state.rows
        .filter((r) => state.board === "ALL" || r.board === state.board)
        .map((r) => r.subject)
    )
  ].sort((a, b) => a.localeCompare(b));

  $("subjectFilter").innerHTML =
    `<option value="ALL">All Subjects</option>` +
    subjects
      .map(
        (subject) =>
          `<option value="${escapeHtml(subject)}">${escapeHtml(subject)}</option>`
      )
      .join("");

  $("subjectFilter").value = subjects.includes(state.subject)
    ? state.subject
    : "ALL";

  if (!subjects.includes(state.subject)) state.subject = "ALL";
}

function getFilteredRows() {
  return state.rows.filter((r) => {
    const boardMatch = state.board === "ALL" || r.board === state.board;
    const subjectMatch =
      state.subject === "ALL" || r.subject === state.subject;
    const searchMatch =
      !state.search || r.title.toLowerCase().includes(state.search);

    return boardMatch && subjectMatch && searchMatch;
  });
}

function average(items) {
  if (!items.length) return null;
  return items.reduce((sum, r) => sum + r.rating, 0) / items.length;
}

function round1(value) {
  return value == null ? null : Math.round(value * 10) / 10;
}

function buildMetrics(rows) {
  const ref = dateFromWeek(state.referenceWeek);

  const weeks = [
    formatDate(ref),
    formatDate(addDays(ref, -7)),
    formatDate(addDays(ref, -14)),
    formatDate(addDays(ref, -21))
  ];

  const groups = new Map();

  rows.forEach((r) => {
    const key = `${r.board}|||${r.subject}|||${r.title}`;

    if (!groups.has(key)) {
      groups.set(key, {
        board: r.board,
        subject: r.subject,
        title: r.title,
        rows: []
      });
    }

    groups.get(key).rows.push(r);
  });

  return [...groups.values()]
    .map((g) => ({
      board: g.board,
      subject: g.subject,
      title: g.title,
      overall: round1(average(g.rows)),
      current: round1(average(g.rows.filter((r) => r.week === weeks[0]))),
      last: round1(average(g.rows.filter((r) => r.week === weeks[1]))),
      last2: round1(average(g.rows.filter((r) => r.week === weeks[2]))),
      last3: round1(average(g.rows.filter((r) => r.week === weeks[3])))
    }))
    .sort(
      (a, b) =>
        a.board.localeCompare(b.board) ||
        a.subject.localeCompare(b.subject) ||
        a.title.localeCompare(b.title)
    );
}

function render() {
  if (!state.rows.length || !state.referenceWeek) return;

  const filtered = getFilteredRows();
  const metrics = buildMetrics(filtered);

  updateKPIs(filtered);

  const tree = buildTree(metrics);
  renderTable(tree);
}

function buildTree(metrics) {
  const boards = new Map();

  metrics.forEach((m) => {
    if (!boards.has(m.board)) {
      boards.set(m.board, new Map());
    }

    const subjects = boards.get(m.board);

    if (!subjects.has(m.subject)) {
      subjects.set(m.subject, []);
    }

    subjects.get(m.subject).push(m);
  });

  return boards;
}

function renderTable(tree) {
  if (!tree.size) {
    $("tableContainer").innerHTML =
      `<div class="empty">No matching data found.</div>`;
    return;
  }

  const expandAll = state.view === "expanded";

  let html = `
    <div class="table-wrap">
      <table>
        <thead>
          <tr>
            <th>Board Name</th>
            <th>Subject Name</th>
            <th>Title</th>
            <th>Rating</th>
            <th>Current Week Rating</th>
            <th>Last Week Rating</th>
            <th>Last to Last Week Rating</th>
            <th>Last to Last to Last Week Rating</th>
          </tr>
        </thead>
        <tbody>
  `;

  tree.forEach((subjects, board) => {
    const boardKey = encodeURIComponent(board);
    const boardOpen = expandAll;

    html += `
      <tr class="board-row" data-board="${boardKey}">
        <td colspan="8">
          <span class="toggle">${boardOpen ? "▼" : "▶"}</span>
          ${escapeHtml(board)}
        </td>
      </tr>
    `;

    subjects.forEach((titles, subject) => {
      const subjectKey = encodeURIComponent(`${board}|||${subject}`);
      const subjectOpen = expandAll;

      html += `
        <tr class="subject-row ${boardOpen ? "" : "hidden"}"
            data-parent-board="${boardKey}"
            data-subject="${subjectKey}">
          <td></td>
          <td colspan="7">
            <span class="toggle">${subjectOpen ? "▼" : "▶"}</span>
            ${escapeHtml(subject)}
          </td>
        </tr>
      `;

      titles.forEach((m) => {
        html += `
          <tr class="title-row ${boardOpen && subjectOpen ? "" : "hidden"}"
              data-parent-board="${boardKey}"
              data-parent-subject="${subjectKey}">
            <td></td>
            <td></td>
            <td class="title-cell">${escapeHtml(m.title)}</td>
            <td>${ratingHtml(m.overall)}</td>
            <td>${ratingHtml(m.current)}</td>
            <td>${ratingHtml(m.last)}</td>
            <td>${ratingHtml(m.last2)}</td>
            <td>${ratingHtml(m.last3)}</td>
          </tr>
        `;
      });
    });
  });

  html += `</tbody></table></div>`;
  $("tableContainer").innerHTML = html;

  attachCollapseHandlers();
}

function attachCollapseHandlers() {
  document.querySelectorAll(".board-row").forEach((row) => {
    row.addEventListener("click", () => {
      const boardKey = row.dataset.board;
      const subjectRows = document.querySelectorAll(
        `.subject-row[data-parent-board="${CSS.escape(boardKey)}"]`
      );
      const titleRows = document.querySelectorAll(
        `.title-row[data-parent-board="${CSS.escape(boardKey)}"]`
      );

      const currentlyHidden = [...subjectRows].every((r) =>
        r.classList.contains("hidden")
      );

      subjectRows.forEach((r) =>
        r.classList.toggle("hidden", !currentlyHidden)
      );
      titleRows.forEach((r) => {
        if (!currentlyHidden) r.classList.add("hidden");
      });

      row.querySelector(".toggle").textContent = currentlyHidden ? "▼" : "▶";
    });
  });

  document.querySelectorAll(".subject-row").forEach((row) => {
    row.addEventListener("click", () => {
      const subjectKey = row.dataset.subject;
      const titleRows = document.querySelectorAll(
        `.title-row[data-parent-subject="${CSS.escape(subjectKey)}"]`
      );

      const currentlyHidden = [...titleRows].every((r) =>
        r.classList.contains("hidden")
      );

      titleRows.forEach((r) =>
        r.classList.toggle("hidden", !currentlyHidden)
      );

      row.querySelector(".toggle").textContent = currentlyHidden ? "▼" : "▶";
    });
  });
}

function updateKPIs(rows) {
  const overall = average(rows);
  const ref = dateFromWeek(state.referenceWeek);

  const currentWeek = formatDate(ref);
  const lastWeek = formatDate(addDays(ref, -7));

  const currentRows = rows.filter((r) => r.week === currentWeek);
  const lastRows = rows.filter((r) => r.week === lastWeek);

  const current = average(currentRows);
  const last = average(lastRows);
  const wow = current != null && last != null ? current - last : null;

  $("overallRating").textContent = formatRating(overall);
  $("currentWeekRating").textContent = formatRating(current);
  $("wowChange").textContent =
    wow == null ? "—" : `${wow >= 0 ? "+" : ""}${wow.toFixed(2)}`;
  $("totalRatings").textContent = rows.length.toLocaleString("en-IN");
}

function formatRating(value) {
  return value == null ? "—" : value.toFixed(1);
}

function ratingHtml(value) {
  if (value == null) {
    return `<span class="rating na">—</span>`;
  }

  const cls = value >= 4.5 ? "good" : value >= 3.5 ? "mid" : "bad";
  return `<span class="rating ${cls}">${value.toFixed(1)}</span>`;
}

function escapeHtml(value) {
  return String(value ?? "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#039;");
}

function showLoading(show) {
  $("loading").classList.toggle("hidden", !show);
}

function showError(message) {
  $("error").textContent = message;
  $("error").classList.remove("hidden");
}

function hideError() {
  $("error").classList.add("hidden");
}
