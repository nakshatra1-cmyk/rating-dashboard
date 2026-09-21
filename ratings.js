"use strict";

/*
  =========================================================
  GOOGLE SHEET CONFIG
  =========================================================
*/

const SHEET_ID =
  "1K9LYi0S6wBGqj6JgWdEtBzYTR507Z2GRHXpDVyA9q2Q";

const SHEET_GID =
  "1993678244";


/*
  =========================================================
  MAIN API
  =========================================================
*/

export default async function handler(req, res) {

  try {

    /*
      Google Sheet CSV endpoint

      Browser se directly call nahi ho raha.
      Vercel server isko call karega.
    */

    const csvUrl =
      `https://docs.google.com/spreadsheets/d/${SHEET_ID}/export?format=csv&gid=${SHEET_GID}`;


    const response =
      await fetch(csvUrl, {
        headers: {
          "User-Agent":
            "Mozilla/5.0 RatingDashboard/1.0"
        }
      });


    if (!response.ok) {

      throw new Error(
        `Google Sheet returned ${response.status}`
      );

    }


    const csv =
      await response.text();


    if (
      !csv ||
      csv.includes("<!DOCTYPE html") ||
      csv.includes("<html")
    ) {

      throw new Error(
        "Google Sheet CSV response is not valid. Please make sure the sheet is publicly accessible."
      );

    }


    /*
      Parse CSV
    */

    const records =
      parseCSV(csv);


    if (!records.length) {

      throw new Error(
        "Google Sheet contains no data."
      );

    }


    /*
      First row = headers
    */

    const headers =
      records[0].map(normalizeHeader);


    /*
      Required columns
    */

    const requiredColumns = [
      "rating_date",
      "rating",
      "title",
      "board_name",
      "subject_name"
    ];


    const missing =
      requiredColumns.filter(
        column =>
          !headers.includes(column)
      );


    if (missing.length) {

      throw new Error(
        `Required columns missing: ${missing.join(", ")}`
      );

    }


    /*
      Column indexes
    */

    const index = {

      ratingDate:
        headers.indexOf("rating_date"),

      rating:
        headers.indexOf("rating"),

      title:
        headers.indexOf("title"),

      board:
        headers.indexOf("board_name"),

      subject:
        headers.indexOf("subject_name")

    };


    /*
      Aggregate data
    */

    const aggregation =
      new Map();


    let totalRawRatings = 0;


    for (
      let i = 1;
      i < records.length;
      i++
    ) {

      const row =
        records[i];


      if (!row || !row.length) {

        continue;

      }


      const title =
        cleanValue(
          row[index.title]
        );


      const board =
        cleanValue(
          row[index.board]
        ) ||
        "Unknown Board";


      const subject =
        cleanValue(
          row[index.subject]
        ) ||
        "Unknown Subject";


      const rating =
        parseRating(
          row[index.rating]
        );


      const ratingDate =
        parseSheetDate(
          row[index.ratingDate]
        );


      /*
        Invalid rows skip
      */

      if (
        !title ||
        rating === null ||
        !ratingDate
      ) {

        continue;

      }


      const week =
        getMonday(
          ratingDate
        );


      const key =
        `${board}|||${subject}|||${title}`;


      if (!aggregation.has(key)) {

        aggregation.set(
          key,
          {
            board,
            subject,
            title,

            overallSum: 0,
            overallCount: 0,

            weeks: {},

            totalRatings: 0
          }
        );

      }


      const item =
        aggregation.get(key);


      /*
        Overall
      */

      item.overallSum += rating;

      item.overallCount += 1;

      item.totalRatings += 1;


      /*
        Weekly
      */

      if (!item.weeks[week]) {

        item.weeks[week] = {
          sum: 0,
          count: 0
        };

      }


      item.weeks[week].sum += rating;

      item.weeks[week].count += 1;


      totalRawRatings++;

    }


    /*
      Convert aggregated data
      */

    const rows = [];


    const allWeeks =
      new Set();


    aggregation.forEach(item => {

      const weeklyRatings = {};


      Object.keys(item.weeks)
        .forEach(week => {

          const data =
            item.weeks[week];


          weeklyRatings[week] =
            round(
              data.sum / data.count
            );


          allWeeks.add(week);

        });


      rows.push({

        board:
          item.board,

        subject:
          item.subject,

        title:
          item.title,

        overall:
          round(
            item.overallSum /
            item.overallCount
          ),

        weeks:
          weeklyRatings,

        totalRatings:
          item.totalRatings

      });

    });


    /*
      Sort newest weeks first
    */

    const weeks =
      [...allWeeks]
        .sort()
        .reverse();


    /*
      Boards
    */

    const boards =
      [...new Set(
        rows.map(
          row => row.board
        )
      )].sort();


    /*
      Subjects
    */

    const subjects =
      [
        ...new Map(
          rows.map(row => [
            `${row.board}|||${row.subject}`,
            {
              board: row.board,
              subject: row.subject
            }
          ])
        ).values()
      ];


    /*
      Cache response

      Vercel can reuse the response
      for 5 minutes.
    */

    res.setHeader(
      "Cache-Control",
      "s-maxage=300, stale-while-revalidate=600"
    );


    res.status(200).json({

      success: true,

      generatedAt:
        new Date().toISOString(),

      totalRawRatings,

      weeks,

      boards,

      subjects,

      rows

    });

  }

  catch (error) {

    console.error(
      "Rating API Error:",
      error
    );


    res.status(500).json({

      success: false,

      error:
        error.message ||
        "Unable to load rating data."

    });

  }

}


/*
  =========================================================
  CSV PARSER
  =========================================================
*/

function parseCSV(text) {

  const rows = [];

  let row = [];

  let value = "";

  let insideQuotes = false;


  for (
    let i = 0;
    i < text.length;
    i++
  ) {

    const char =
      text[i];


    const next =
      text[i + 1];


    if (char === '"') {

      if (
        insideQuotes &&
        next === '"'
      ) {

        value += '"';

        i++;

      } else {

        insideQuotes =
          !insideQuotes;

      }

      continue;

    }


    if (
      char === "," &&
      !insideQuotes
    ) {

      row.push(value);

      value = "";

      continue;

    }


    if (
      (char === "\n" || char === "\r") &&
      !insideQuotes
    ) {

      if (
        char === "\r" &&
        next === "\n"
      ) {

        i++;

      }


      row.push(value);

      value = "";


      if (
        row.some(
          cell =>
            String(cell).trim() !== ""
        )
      ) {

        rows.push(row);

      }


      row = [];

      continue;

    }


    value += char;

  }


  /*
    Last value
  */

  if (
    value !== "" ||
    row.length
  ) {

    row.push(value);

  }


  if (
    row.some(
      cell =>
        String(cell).trim() !== ""
    )
  ) {

    rows.push(row);

  }


  return rows;

}


/*
  =========================================================
  HEADER NORMALIZATION
  =========================================================
*/

function normalizeHeader(value) {

  return String(value || "")
    .replace(/^\uFEFF/, "")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, "_");

}


/*
  =========================================================
  CLEAN VALUE
  =========================================================
*/

function cleanValue(value) {

  return String(
    value ?? ""
  ).trim();

}


/*
  =========================================================
  RATING
  =========================================================
*/

function parseRating(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const number =
    Number(
      String(value)
        .replace(",", ".")
        .trim()
    );


  if (
    !Number.isFinite(number)
  ) {

    return null;

  }


  /*
    Ignore impossible rating values
  */

  if (
    number < 1 ||
    number > 5
  ) {

    return null;

  }


  return number;

}


/*
  =========================================================
  DATE PARSER
  =========================================================
*/

function parseSheetDate(value) {

  if (
    value === null ||
    value === undefined
  ) {

    return null;

  }


  const raw =
    String(value).trim();


  if (!raw) {

    return null;

  }


  /*
    YYYY-MM-DD
  */

  let match =
    raw.match(
      /^(\d{4})-(\d{1,2})-(\d{1,2})/
    );


  if (match) {

    return new Date(
      Number(match[1]),
      Number(match[2]) - 1,
      Number(match[3])
    );

  }


  /*
    DD/MM/YYYY
  */

  match =
    raw.match(
      /^(\d{1,2})\/(\d{1,2})\/(\d{4})/
    );


  if (match) {

    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  }


  /*
    DD-MM-YYYY
  */

  match =
    raw.match(
      /^(\d{1,2})-(\d{1,2})-(\d{4})/
    );


  if (match) {

    return new Date(
      Number(match[3]),
      Number(match[2]) - 1,
      Number(match[1])
    );

  }


  /*
    Google Sheet formats such as:
    16 Jul 2026
    16 Jul, 2026
  */

  const cleaned =
    raw.replace(",", "");


  const parsed =
    new Date(cleaned);


  if (
    !Number.isNaN(
      parsed.getTime()
    )
  ) {

    return new Date(
      parsed.getFullYear(),
      parsed.getMonth(),
      parsed.getDate()
    );

  }


  return null;

}


/*
  =========================================================
  MONDAY OF WEEK
  =========================================================
*/

function getMonday(date) {

  const result =
    new Date(date);


  const day =
    result.getDay();


  const difference =
    day === 0
      ? -6
      : 1 - day;


  result.setDate(
    result.getDate() + difference
  );


  return formatDate(result);

}


/*
  =========================================================
  DATE FORMAT
  =========================================================
*/

function formatDate(date) {

  const year =
    date.getFullYear();


  const month =
    String(
      date.getMonth() + 1
    ).padStart(2, "0");


  const day =
    String(
      date.getDate()
    ).padStart(2, "0");


  return `${year}-${month}-${day}`;

}


/*
  =========================================================
  ROUND
  =========================================================
*/

function round(value) {

  return Number(
    Number(value).toFixed(2)
  );

}
