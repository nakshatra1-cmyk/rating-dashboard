/*
  GOOGLE SHEET CONNECTION
  -----------------------------------------------------------
  1) In Google Sheets: File -> Share -> Publish to web
  2) Select the sheet/tab containing your data and choose CSV.
  3) Paste the published CSV URL below.
  Example:
  https://docs.google.com/spreadsheets/d/e/....../pub?gid=123456&single=true&output=csv

  If your sheet is already publicly readable, you can also use:
  https://docs.google.com/spreadsheets/d/SHEET_ID/gviz/tq?tqx=out:csv&gid=GID
*/
const SHEET_CSV_URL = "https://docs.google.com/spreadsheets/d/1K9LYi0S6wBGqj6JgWdEtBzYTR507Z2GRHXpDVyA9q2Q/export?format=csv&gid=1993678244&utm_source=chatgpt.com";

const BENCHMARK = 4.3;
const LAST_N_WEEKS = 5;
let RAW = [];
let FILTERED = [];
let expandedBoards = new Set();
let allWeekNumbers = [];

const $ = id => document.getElementById(id);

function clean(v){ return String(v ?? "").trim(); }
function num(v){
  const n = parseFloat(String(v ?? "").replace(/,/g,""));
  return Number.isFinite(n) ? n : 0;
}
function normalizeKey(s){
  return clean(s).toLowerCase().replace(/[\s_]+/g,"").replace(/[()]/g,"");
}
function parseCSV(text){
  const rows=[]; let row=[], cell="", quoted=false;
  for(let i=0;i<text.length;i++){
    const c=text[i], n=text[i+1];
    if(c === '"'){
      if(quoted && n === '"'){ cell+='"'; i++; }
      else quoted=!quoted;
    } else if(c === "," && !quoted){ row.push(cell); cell=""; }
    else if((c === "\n" || c === "\r") && !quoted){
      if(c === "\r" && n === "\n") i++;
      row.push(cell); cell="";
      if(row.some(x=>clean(x)!=="")) rows.push(row);
      row=[];
    } else cell+=c;
  }
  if(cell!=="" || row.length){row.push(cell); if(row.some(x=>clean(x)!=="")) rows.push(row);}
  return rows;
}
function toObjects(csv){
  const rows=parseCSV(csv);
  if(!rows.length) return [];
  const headers=rows[0].map(h=>clean(h).replace(/^"|"$/g,""));
  return rows.slice(1).map(r=>{
    const o={}; headers.forEach((h,i)=>o[h]=clean(r[i]));
    return o;
  });
}
function getField(row, name){
  if(row[name] !== undefined) return row[name];
  const target=normalizeKey(name);
  const k=Object.keys(row).find(x=>normalizeKey(x)===target);
  return k ? row[k] : "";
}
function parseDate(s){
  if(!s) return null;
  const d=new Date(s);
  if(!isNaN(d)) return d;
  const m=String(s).match(/(\d{1,2})\s+([A-Za-z]+),?\s+(\d{4})/);
  if(m) return new Date(`${m[2]} ${m[1]}, ${m[3]}`);
  return null;
}
function weekNo(row){
  const explicit=num(getField(row,"Week Name"));
  if(explicit) return explicit;
  const d=parseDate(getField(row,"rating_date_updated"));
  if(!d) return 0;
  const jan1=new Date(d.getFullYear(),0,1);
  return Math.ceil((((d-jan1)/86400000)+jan1.getDay()+1)/7);
}
function monthSortKey(label){
  const m=clean(label).match(/^([A-Za-z]+)\s*-\s*(\d{2,4})$/);
  if(!m) return [9999,999];
  const names={january:1,february:2,march:3,april:4,may:5,june:6,july:7,august:8,september:9,october:10,november:11,december:12};
  return [2000+Number(m[2]), names[m[1].toLowerCase()]||99];
}
function unique(arr){return [...new Set(arr.filter(Boolean))];}
function formatNum(n){return Number(n||0).toLocaleString("en-IN");}
function formatRating(n){return n===null || n===undefined || !Number.isFinite(n) ? "" : n.toFixed(2);}
function ratingClass(n){
  if(!Number.isFinite(n)) return "";
  if(n < BENCHMARK) return "rating-bad";
  if(n > BENCHMARK) return "rating-good";
  return "rating-neutral";
}
function esc(s){
  return String(s??"").replace(/[&<>"']/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#039;"}[c]));
}

async function loadData(){
  setStatus("Loading…");
  if(!SHEET_CSV_URL || SHEET_CSV_URL.includes("PASTE_YOUR")){
    setStatus("Add Sheet URL");
    showToast("Open script.js and paste your Google Sheet CSV URL.");
    return;
  }
  try{
    const res=await fetch(SHEET_CSV_URL,{cache:"no-store"});
    if(!res.ok) throw new Error(`HTTP ${res.status}`);
    const csv=await res.text();
    RAW=toObjects(csv);
    if(!RAW.length) throw new Error("No rows found");
    setupFilters();
    applyFilters();
    setStatus("Live");
  }catch(e){
    console.error(e);
    setStatus("Error");
    showToast("Could not load Google Sheet. Check the CSV URL and publishing permissions.");
  }
}
function setStatus(t){$("statusPill").textContent=t;}
function setupFilters(){
  const boards=unique(RAW.map(r=>getField(r,"Board Name"))).sort();
  const subjects=unique(RAW.map(r=>getField(r,"Subject Name"))).sort();
  fillSelect("boardFilter",boards,"All Boards");
  fillSelect("subjectFilter",subjects,"All Subjects");
}
function fillSelect(id,vals,first){
  const el=$(id), old=el.value;
  el.innerHTML=`<option value="">${first}</option>`+vals.map(v=>`<option value="${esc(v)}">${esc(v)}</option>`).join("");
  if(vals.includes(old)) el.value=old;
}
function applyFilters(){
  const board=$("boardFilter").value, subject=$("subjectFilter").value;
  const from=$("fromDate").value ? new Date($("fromDate").value+"T00:00:00") : null;
  const to=$("toDate").value ? new Date($("toDate").value+"T23:59:59") : null;
  FILTERED=RAW.filter(r=>{
    if(board && getField(r,"Board Name")!==board) return false;
    if(subject && getField(r,"Subject Name")!==subject) return false;
    const d=parseDate(getField(r,"rating_date_updated"));
    if(from && (!d || d<from)) return false;
    if(to && (!d || d>to)) return false;
    return true;
  });
  renderAll();
}
function renderAll(){
  $("recordCount").textContent=`${formatNum(FILTERED.length)} records`;
  const weeks=unique(FILTERED.map(weekNo).filter(Boolean)).sort((a,b)=>a-b);
  allWeekNumbers=weeks;
  const latest=weeks.length?weeks[weeks.length-1]:0;
  const selectedWeeks=weeks.slice(-LAST_N_WEEKS);
  $("weekWindow").textContent=selectedWeeks.length?`Weeks ${selectedWeeks.join(", ")} · last ${selectedWeeks.length}`:"Last 5 weeks";
  const months=unique(FILTERED.map(r=>getField(r,"Month Name")));
  $("monthWindow").textContent=`${months.length} month${months.length===1?"":"s"} available`;
  const ratings=FILTERED.map(r=>num(getField(r,"rating"))).filter((x,i)=>getField(FILTERED[i],"rating")!=="");
  const avg=ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null;
  $("overallRating").textContent=avg===null?"—":formatRating(avg);
  $("totalRating").textContent=formatNum(ratings.length);
  $("uniqueStudents").textContent=formatNum(unique(FILTERED.map(r=>getField(r,"studentid"))).length);
  $("latestWeek").textContent=latest?`Week ${latest}`:"—";
  renderWeekly(selectedWeeks);
  renderMonthly();
}

function aggregate(rows){
  const ratings=rows.map(r=>num(getField(r,"rating"))).filter((x,i)=>getField(rows[i],"rating")!=="");
  return {avg:ratings.length?ratings.reduce((a,b)=>a+b,0)/ratings.length:null,sum:ratings.reduce((a,b)=>a+b,0),count:ratings.length};
}
function groupBy(arr,keyFn){
  const m=new Map();
  arr.forEach(x=>{const k=keyFn(x); if(!m.has(k))m.set(k,[]);m.get(k).push(x);});
  return m;
}
function boardSubjectRows(rows){
  return [...groupBy(rows,r=>getField(r,"Board Name"))].sort((a,b)=>a[0].localeCompare(b[0]));
}
function ratingCells(rows, periods){
  return periods.flatMap(p=>{
    const a=aggregate(rows.filter(r=>p.match(r)));
    return [
      `<td class="${ratingClass(a.avg)}">${formatRating(a.avg)}</td>`,
      `<td>${formatNum(a.count)}</td>`
    ];
  }).join("");
}
function renderWeekly(weeks){
  const table=$("weeklyTable");
  if(!weeks.length){
    table.innerHTML="<tbody><tr><td>No data available for selected filters.</td></tr></tbody>"; return;
  }
  const periods=weeks.map(w=>({label:String(w),match:r=>weekNo(r)===w}));
  let html=`<thead><tr><th rowspan="2" style="min-width:145px">Board Name</th><th rowspan="2" style="min-width:155px">Subject Name</th><th colspan="${periods.length*2}">Week Name · Values</th><th colspan="2">Grand Total</th></tr><tr>`;
  periods.forEach(p=>html+=`<th>${p.label}<br><small>AVERAGE</small></th><th>${p.label}<br><small>COUNT</small></th>`);
  html+=`<th>AVERAGE</th><th>COUNT</th></tr></thead><tbody>`;
  // IMPORTANT:
  // - The weekly visualization columns contain ONLY the latest 5 weeks.
  // - The "Grand Total" columns are calculated from ALL filtered records,
  //   not just the latest 5 weeks.
  const last5Rows = FILTERED.filter(r=>weeks.includes(weekNo(r)));

  boardSubjectRows(last5Rows).forEach(([board])=>{
    const bRowsAll = FILTERED.filter(r=>getField(r,"Board Name")===board);
    const bRows5 = bRowsAll.filter(r=>weeks.includes(weekNo(r)));
    const expanded=expandedBoards.has(board);
    const bAgg=aggregate(bRowsAll);

    html+=`<tr class="board-row"><td><span class="toggle" data-board="${esc(board)}">${expanded?"▾":"▸"}</span>${esc(board)}</td><td></td>${ratingCells(bRows5,periods)}<td class="${ratingClass(bAgg.avg)}">${formatRating(bAgg.avg)}</td><td>${formatNum(bAgg.count)}</td></tr>`;

    if(expanded){
      const subjects=groupBy(bRows5,r=>getField(r,"Subject Name"));
      [...subjects].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([subject])=>{
        const sRowsAll=bRowsAll.filter(r=>getField(r,"Subject Name")===subject);
        const sRows5=sRowsAll.filter(r=>weeks.includes(weekNo(r)));
        const a=aggregate(sRowsAll);
        html+=`<tr class="subject-row"><td></td><td>${esc(subject)}</td>${ratingCells(sRows5,periods)}<td class="${ratingClass(a.avg)}">${formatRating(a.avg)}</td><td>${formatNum(a.count)}</td></tr>`;
      });
    }
  });

  // Weekly cells = latest 5 weeks; Grand Total = ALL filtered weeks.
  const grand=aggregate(FILTERED);
  html+=`<tr class="grand-row"><td>Grand Total</td><td></td>${ratingCells(last5Rows,periods)}<td class="${ratingClass(grand.avg)}">${formatRating(grand.avg)}</td><td>${formatNum(grand.count)}</td></tr>`;
  html+="</tbody>";
  table.innerHTML=html;
  table.querySelectorAll(".toggle").forEach(el=>el.addEventListener("click",()=>{
    const b=el.dataset.board;
    expandedBoards.has(b)?expandedBoards.delete(b):expandedBoards.add(b);
    renderWeekly(weeks);
  }));
}
function renderMonthly(){
  const table=$("monthlyTable");
  const months=unique(FILTERED.map(r=>getField(r,"Month Name"))).sort((a,b)=>{
    const aa=monthSortKey(a),bb=monthSortKey(b); return aa[0]-bb[0]||aa[1]-bb[1];
  });
  if(!months.length){table.innerHTML="<tbody><tr><td>No data available for selected filters.</td></tr></tbody>";return;}
  const periods=months.map(m=>({label:m,match:r=>getField(r,"Month Name")===m}));
  let html=`<thead><tr><th rowspan="2" style="min-width:145px">Board Name</th><th rowspan="2" style="min-width:155px">Subject Name</th>`;
  periods.forEach(p=>html+=`<th colspan="2">${esc(p.label)}</th>`);
  html+=`<th colspan="2">Grand Total</th></tr><tr>`;
  periods.forEach(p=>html+=`<th>AVERAGE</th><th>COUNT</th>`);
  html+=`<th>AVERAGE</th><th>COUNT</th></tr></thead><tbody>`;
  boardSubjectRows(FILTERED).forEach(([board,bRows])=>{
    const expanded=expandedBoards.has("M:"+board), bAgg=aggregate(bRows);
    html+=`<tr class="board-row"><td><span class="toggle" data-board="${esc(board)}">${expanded?"▾":"▸"}</span>${esc(board)}</td><td></td>${ratingCells(bRows,periods)}<td class="${ratingClass(bAgg.avg)}">${formatRating(bAgg.avg)}</td><td>${formatNum(bAgg.count)}</td></tr>`;
    if(expanded){
      const subjects=groupBy(bRows,r=>getField(r,"Subject Name"));
      [...subjects].sort((a,b)=>a[0].localeCompare(b[0])).forEach(([subject,sRows])=>{
        const a=aggregate(sRows);
        html+=`<tr class="subject-row"><td></td><td>${esc(subject)}</td>${ratingCells(sRows,periods)}<td class="${ratingClass(a.avg)}">${formatRating(a.avg)}</td><td>${formatNum(a.count)}</td></tr>`;
      });
    }
  });
  const grand=aggregate(FILTERED);
  html+=`<tr class="grand-row"><td>Grand Total</td><td></td>${ratingCells(FILTERED,periods)}<td class="${ratingClass(grand.avg)}">${formatRating(grand.avg)}</td><td>${formatNum(grand.count)}</td></tr></tbody>`;
  table.innerHTML=html;
  table.querySelectorAll(".toggle").forEach(el=>el.addEventListener("click",()=>{
    const b="M:"+el.dataset.board;
    expandedBoards.has(b)?expandedBoards.delete(b):expandedBoards.add(b);
    renderMonthly();
  }));
}
async function exportPNG(tableId){
  const table=$(tableId);
  const wrap=table.parentElement;
  showToast("Preparing PNG…");
  const old={overflow:wrap.style.overflow,width:wrap.style.width};
  wrap.style.overflow="visible"; wrap.style.width=table.scrollWidth+"px";
  try{
    const canvas=await html2canvas(wrap,{backgroundColor:"#ffffff",scale:2,useCORS:true});
    const a=document.createElement("a");
    a.download=`${tableId}-${new Date().toISOString().slice(0,10)}.png`;
    a.href=canvas.toDataURL("image/png"); a.click();
    showToast("PNG exported.");
  }catch(e){console.error(e);showToast("PNG export failed.");}
  wrap.style.overflow=old.overflow; wrap.style.width=old.width;
}
function showToast(msg){
  const t=$("toast"); t.textContent=msg;t.classList.add("show");
  clearTimeout(window.__toast);window.__toast=setTimeout(()=>t.classList.remove("show"),2500);
}
$("boardFilter").addEventListener("change",applyFilters);
$("subjectFilter").addEventListener("change",applyFilters);
$("fromDate").addEventListener("change",applyFilters);
$("toDate").addEventListener("change",applyFilters);
$("resetBtn").addEventListener("click",()=>{
  $("boardFilter").value="";$("subjectFilter").value="";$("fromDate").value="";$("toDate").value="";
  expandedBoards.clear();applyFilters();
});
$("refreshBtn").addEventListener("click",loadData);
document.querySelectorAll("[data-export]").forEach(b=>b.addEventListener("click",()=>exportPNG(b.dataset.export)));
loadData();
