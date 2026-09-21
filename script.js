"use strict";

/* =========================================================
   GLOBAL STATE
========================================================= */

let dashboardData = null;

let boardOpenState = {};
let subjectOpenState = {};


/* =========================================================
   DOM
========================================================= */

const weekFilter = document.getElementById("weekFilter");
const boardFilter = document.getElementById("boardFilter");
const subjectFilter = document.getElementById("subjectFilter");
const titleSearch = document.getElementById("titleSearch");
const viewFilter = document.getElementById("viewFilter");

const refreshBtn = document.getElementById("refreshBtn");
const retryBtn = document.getElementById("retryBtn");

const tableBody = document.getElementById("tableBody");

const loadingState = document.getElementById("loadingState");
const errorState = document.getElementById("errorState");
const emptyState = document.getElementById("emptyState");
const tableWrapper = document.getElementById("tableWrapper");

const errorMessage = document.getElementById("errorMessage");

const overallRating = document.getElementById("overallRating");
const currentRating = document.getElementById("currentRating");
const wowChange = document.getElementById("wowChange");
const totalRatings = document.getElementById("totalRatings");

const lastUpdated = document.getElementById("lastUpdated");


/* =========================================================
   INIT
========================================================= */

document.addEventListener("DOMContentLoaded", () => {

  refreshBtn.addEventListener("click", loadDashboard);

  retryBtn.addEventListener("click", loadDashboard);

  weekFilter.addEventListener("change", renderDashboard);

  boardFilter.addEventListener("change", () => {

    populateSubjectFilter();

    renderDashboard();

  });

  subjectFilter.addEventListener("change", renderDashboard);

  titleSearch.addEventListener("input", debounce(renderDashboard, 200));

  viewFilter.addEventListener("change", () => {

    const mode = viewFilter.value;

    if (mode === "expanded") {

      setAllOpen(true);

    } else {

      setAllOpen(false);

    }

    renderDashboard();

  });

  loadDashboard();

});


/* =========================================================
   LOAD DATA
========================================================= */

async function loadDashboard() {

  showLoading();

  try {

    const response = await fetch("/api/ratings", {

      method: "GET",

      headers: {
        "Accept": "application/json"
      },

      cache: "no-store"

    });


    if (!response.ok) {

      throw new Error(
        `API error: ${response.status} ${response.statusText}`
      );

    }


    const result = await response.json();


    if (!result.success) {

      throw new Error(
        result.error || "Unable to load dashboard data."
      );

    }


    dashboardData = result;


    initializeFilters();

    renderDashboard();

    lastUpdated.textContent =
      `Updated: ${formatDateTime(new Date())}`;

  }

  catch (error) {

    console.error(error);

    showError(error.message);

  }

}


/* =========================================================
   FILTER INITIALIZATION
========================================================= */

function initializeFilters() {

  if (!dashboardData) return;


  /* -----------------------------
     Weeks
  ----------------------------- */

  weekFilter.innerHTML = "";

  dashboardData.weeks.forEach((week, index) => {

    const option = document.createElement("option");

    option.value = week;

    option.textContent = formatWeek(week);

    if (index === 0) {

      option.selected = true;

    }

    weekFilter.appendChild(option);

  });


  /* -----------------------------
     Boards
  ----------------------------- */

  boardFilter.innerHTML =
    `<option value="">All Boards</option>`;

  dashboardData.boards.forEach(board => {

    const option = document.createElement("option");

    option.value = board;

    option.textContent = board;

    boardFilter.appendChild(option);

  });


  populateSubjectFilter();


  boardOpenState = {};
  subjectOpenState = {};

  setAllOpen(true);

}


/* =========================================================
   SUBJECT FILTER
========================================================= */

function populateSubjectFilter() {

  if (!dashboardData) return;


  const selectedBoard = boardFilter.value;

  const subjects = new Set();


  dashboardData.rows.forEach(row => {

    if (
      selectedBoard &&
      row.board !== selectedBoard
    ) {

      return;

    }

    if (row.subject) {

      subjects.add(row.subject);

    }

  });


  const currentValue = subjectFilter.value;


  subjectFilter.innerHTML =
    `<option value="">All Subjects</option>`;


  [...subjects]
    .sort((a, b) =>
      a.localeCompare(b, undefined, {
        sensitivity: "base"
      })
    )
    .forEach(subject => {

      const option = document.createElement("option");

      option.value = subject;

      option.textContent = subject;

      subjectFilter.appendChild(option);

    });


  if ([...subjects].includes(currentValue)) {

    subjectFilter.value = currentValue;

  }

}


/* =========================================================
   RENDER DASHBOARD
========================================================= */

function renderDashboard() {

  if (!dashboardData) return;


  const selectedWeek = weekFilter.value;

  const selectedBoard = boardFilter.value;

  const selectedSubject = subjectFilter.value;

  const search = titleSearch.value
    .trim()
    .toLowerCase();


  let rows = dashboardData.rows.filter(row => {

    if (
      selectedBoard &&
      row.board !== selectedBoard
    ) {

      return false;

    }


    if (
      selectedSubject &&
      row.subject !== selectedSubject
    ) {

      return false;

    }


    if (
      search &&
      !row.title.toLowerCase().includes(search)
    ) {

      return false;

    }


    return true;

  });


  updateKPIs(rows, selectedWeek);

  renderTable(rows, selectedWeek);

}


/* =========================================================
   KPI
========================================================= */

function updateKPIs(rows, selectedWeek) {

  if (!rows.length) {

    overallRating.textContent = "-";
    currentRating.textContent = "-";
    wowChange.textContent = "-";
    totalRatings.textContent = "0";

    return;

  }


  const overallValues = rows
    .map(r => r.overall)
    .filter(isNumber);


  const currentValues = rows
    .map(r => r.weeks?.[selectedWeek])
    .filter(isNumber);


  const previousWeek = getPreviousWeek(selectedWeek);


  const previousValues = rows
    .map(r => r.weeks?.[previousWeek])
    .filter(isNumber);


  const overall =
    average(overallValues);


  const current =
    average(currentValues);


  const previous =
    average(previousValues);


  const change =
    isNumber(current) && isNumber(previous)
      ? current - previous
      : null;


  overallRating.textContent =
    formatRating(overall);


  currentRating.textContent =
    formatRating(current);


  if (change === null) {

    wowChange.textContent = "-";

  } else {

    wowChange.textContent =
      `${change >= 0 ? "+" : ""}${change.toFixed(2)}`;

    wowChange.className =
      `kpi-value ${
        change >= 0
          ? "change-positive"
          : "change-negative"
      }`;

  }


  const total =
    rows.reduce(
      (sum, row) =>
        sum + (row.totalRatings || 0),
      0
    );


  totalRatings.textContent =
    total.toLocaleString("en-IN");

}


/* =========================================================
   TABLE
========================================================= */

function renderTable(rows, selectedWeek) {

  tableBody.innerHTML = "";


  if (!rows.length) {

    tableWrapper.classList.add("hidden");

    emptyState.classList.remove("hidden");

    return;

  }


  emptyState.classList.add("hidden");

  tableWrapper.classList.remove("hidden");


  const hierarchy = {};


  rows.forEach(row => {

    if (!hierarchy[row.board]) {

      hierarchy[row.board] = {};

    }


    if (!hierarchy[row.board][row.subject]) {

      hierarchy[row.board][row.subject] = [];

    }


    hierarchy[row.board][row.subject].push(row);

  });


  Object.keys(hierarchy)
    .sort()
    .forEach(board => {

      const boardKey = createKey("board", board);


      /* BOARD ROW */

      const boardRow =
        document.createElement("tr");

      boardRow.className = "board-row";


      const boardCell =
        document.createElement("td");

      boardCell.className = "name-cell";

      boardCell.colSpan = 1;


      const boardOpen =
        boardOpenState[boardKey] !== false;


      boardCell.innerHTML = `
        <span
          class="expand-icon ${boardOpen ? "open" : ""}"
          data-board="${escapeAttr(boardKey)}"
        >
          ▶
        </span>

        ${escapeHTML(board)}
      `;


      boardRow.appendChild(boardCell);


      addEmptyCells(boardRow, 5);


      boardCell.addEventListener("click", () => {

        boardOpenState[boardKey] =
          !(boardOpenState[boardKey] !== false);

        renderDashboard();

      });


      tableBody.appendChild(boardRow);


      if (!boardOpen) return;


      Object.keys(hierarchy[board])
        .sort()
        .forEach(subject => {

          const subjectKey =
            createKey(
              "subject",
              `${board}__${subject}`
            );


          const subjectRow =
            document.createElement("tr");

          subjectRow.className =
            "subject-row";


          const subjectCell =
            document.createElement("td");

          subjectCell.className =
            "name-cell";


          const subjectOpen =
            subjectOpenState[subjectKey] !== false;


          subjectCell.innerHTML = `
            <span
              class="expand-icon ${subjectOpen ? "open" : ""}"
              data-subject="${escapeAttr(subjectKey)}"
            >
              ▶
            </span>

            ${escapeHTML(subject)}
          `;


          subjectRow.appendChild(subjectCell);

          addEmptyCells(subjectRow, 5);


          subjectCell.addEventListener("click", () => {

            subjectOpenState[subjectKey] =
              !(subjectOpenState[subjectKey] !== false);

            renderDashboard();

          });


          tableBody.appendChild(subjectRow);


          if (!subjectOpen) return;


          hierarchy[board][subject]
            .sort((a, b) =>
              a.title.localeCompare(
                b.title,
                undefined,
                {
                  sensitivity: "base"
                }
              )
            )
            .forEach(row => {

              tableBody.appendChild(
                createTitleRow(
                  row,
                  selectedWeek
                )
              );

            });

        });

    });

}


/* =========================================================
   TITLE ROW
========================================================= */

function createTitleRow(row, selectedWeek) {

  const tr =
    document.createElement("tr");

  tr.className = "title-row";


  const titleCell =
    document.createElement("td");

  titleCell.className =
    "name-cell title-name";

  titleCell.textContent =
    row.title;


  tr.appendChild(titleCell);


  /* Overall */

  tr.appendChild(
    createRatingCell(row.overall)
  );


  /* Current */

  const current =
    row.weeks?.[selectedWeek];

  tr.appendChild(
    createRatingCell(current)
  );


  /* Last */

  const lastWeek =
    getPreviousWeek(selectedWeek);

  tr.appendChild(
    createRatingCell(
      row.weeks?.[lastWeek]
    )
  );


  /* Last 2 */

  const last2 =
    getPreviousWeek(
      lastWeek
    );

  tr.appendChild(
    createRatingCell(
      row.weeks?.[last2]
    )
  );


  /* Last 3 */

  const last3 =
    getPreviousWeek(
      last2
    );

  tr.appendChild(
    createRatingCell(
      row.weeks?.[last3]
    )
  );


  return tr;

}


/* =========================================================
   RATING CELL
========================================================= */

function createRatingCell(value) {

  const td =
    document.createElement("td");


  if (!isNumber(value)) {

    td.innerHTML =
      `<span class="rating-empty">—</span>`;

    return td;

  }


  const span =
    document.createElement("span");

  span.className =
    `rating-chip ${ratingClass(value)}`;

  span.textContent =
    value.toFixed(1);


  td.appendChild(span);


  return td;

}


/* =========================================================
   HELPERS
========================================================= */

function ratingClass(value) {

  if (value >= 4.5) {

    return "rating-green";

  }

  if (value >= 3.5) {

    return "rating-amber";

  }

  return "rating-red";

}


function formatRating(value) {

  if (!isNumber(value)) {

    return "-";

  }

  return value.toFixed(2);

}


function average(values) {

  if (!values.length) {

    return null;

  }

  return values.reduce(
    (sum, value) =>
      sum + value,
    0
  ) / values.length;

}


function isNumber(value) {

  return (
    typeof value === "number" &&
    Number.isFinite(value)
  );

}


/* =========================================================
   WEEK HELPERS
========================================================= */

function getPreviousWeek(week) {

  if (!week) return null;


  const date =
    parseLocalDate(week);


  date.setDate(
    date.getDate() - 7
  );


  return formatDate(date);

}


function parseLocalDate(value) {

  const parts =
    value.split("-").map(Number);

  return new Date(
    parts[0],
    parts[1] - 1,
    parts[2]
  );

}


function formatDate(date) {

  const y =
    date.getFullYear();


  const m =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");


  const d =
    String(
      date.getDate()
    ).padStart(2, "0");


  return `${y}-${m}-${d}`;

}


function formatWeek(value) {

  const date =
    parseLocalDate(value);


  const end =
    new Date(date);

  end.setDate(
    end.getDate() + 6
  );


  return `${formatDisplayDate(date)} – ${formatDisplayDate(end)}`;

}


function formatDisplayDate(date) {

  return date.toLocaleDateString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      year: "numeric"
    }
  );

}


/* =========================================================
   OPEN / CLOSE
========================================================= */

function setAllOpen(open) {

  if (!dashboardData) return;


  dashboardData.boards.forEach(board => {

    boardOpenState[
      createKey("board", board)
    ] = open;


    dashboardData.subjects
      .filter(item =>
        item.board === board
      )
      .forEach(item => {

        subjectOpenState[
          createKey(
            "subject",
            `${item.board}__${item.subject}`
          )
        ] = open;

      });

  });

}


function createKey(type, value) {

  return `${type}:${value}`;

}


/* =========================================================
   UI STATES
========================================================= */

function showLoading() {

  loadingState.classList.remove("hidden");

  errorState.classList.add("hidden");

  emptyState.classList.add("hidden");

  tableWrapper.classList.add("hidden");

}


function showError(message) {

  loadingState.classList.add("hidden");

  tableWrapper.classList.add("hidden");

  emptyState.classList.add("hidden");

  errorState.classList.remove("hidden");

  errorMessage.textContent =
    message || "Unknown error";

}


/* =========================================================
   HTML SAFETY
========================================================= */

function escapeHTML(value) {

  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#039;");

}


function escapeAttr(value) {

  return escapeHTML(value);

}


/* =========================================================
   TABLE CELLS
========================================================= */

function addEmptyCells(row, count) {

  for (let i = 0; i < count; i++) {

    const td =
      document.createElement("td");

    row.appendChild(td);

  }

}


/* =========================================================
   DEBOUNCE
========================================================= */

function debounce(fn, delay) {

  let timer;

  return function (...args) {

    clearTimeout(timer);

    timer = setTimeout(
      () => fn.apply(this, args),
      delay
    );

  };

}


/* =========================================================
   DATE/TIME
========================================================= */

function formatDateTime(date) {

  return date.toLocaleString(
    "en-IN",
    {
      day: "2-digit",
      month: "short",
      hour: "2-digit",
      minute: "2-digit"
    }
  );

}
