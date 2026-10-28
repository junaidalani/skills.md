/**
 * Google Apps Script backend for the agent's calendar / sheet actions.
 * One deployment serves both.
 *
 * SETUP
 * 1. script.google.com -> New project -> paste this file.
 * 2. Set CALENDAR_ID (or leave 'primary') and SHEET_ID below ("SpreadsheetApp.getActive()"
 *    only works if the script is bound to a sheet; otherwise paste the sheet's id from its URL).
 * 3. Deploy -> New deployment -> type "Web app" -> Execute as: Me -> Who has access: Anyone.
 * 4. Copy the /exec URL into agent.yaml under business.actions (or the dashboard later).
 *
 * CONTRACT (what app/actions.py sends):
 *   POST JSON {action, type, company, call_id, caller, data:{...}} -> JSON {ok, message}
 *   message is spoken back to the caller, so keep it one short sentence.
 */
var CALENDAR_ID = 'primary';
var SHEET_ID = '';            // '' = script is bound to the sheet
var SHEET_NAME = 'Leads';
var TIMEZONE = 'America/New_York';   // change to your zone
var OPEN_HOUR = 9, CLOSE_HOUR = 18;  // booking window
var SCRIPT_SECRET = '';           // optional: same value as "secret:" in agent.yaml actions entries

function doPost(e) {
  var body = JSON.parse(e.postData.contents);
  var d = body.data || {};
  try {
    if (SCRIPT_SECRET && body.secret !== SCRIPT_SECRET) throw new Error('not allowed');
    if (body.type === 'calendar') return ok(book(d));
    if (body.type === 'availability') return ok(availability(d));
    if (body.type === 'sheet') return ok(appendRow(body, d));
    return ok('The team has been notified.');
  } catch (err) {
    return ContentService.createTextOutput(JSON.stringify({ ok: false, message: String(err) }))
      .setMimeType(ContentService.MimeType.JSON);
  }
}

function ok(msg) {
  return ContentService.createTextOutput(JSON.stringify({ ok: true, message: msg }))
    .setMimeType(ContentService.MimeType.JSON);
}

function book(d) {
  if (!d.date || !d.time) throw new Error('date and time are required');
  var start = new Date(d.date + 'T' + d.time + ':00');
  if (isNaN(start)) throw new Error('bad date or time');
  if (start < new Date()) throw new Error('that time is in the past');
  var end = new Date(start.getTime() + 30 * 60000);
  var cal = calendar();
  if (cal.getEvents(start, end).length) {
    return 'Sorry, that slot is already taken. ' + slotsOn(d.date).join(', ') + ' are free.';
  }
  cal.createEvent('Appointment: ' + (d.name || 'caller') + ' - ' + (d.service || 'enquiry'), start, end,
    { description: 'Booked by AI receptionist.\nPhone: ' + (d.phone || '') + '\nNotes: ' + (d.notes || '') });
  return 'Your appointment is confirmed for ' + d.date + ' at ' + d.time + '.';
}

function calendar() {
  return CalendarApp.getCalendarById(CALENDAR_ID) || CalendarApp.getDefaultCalendar();
}

function availability(d) {
  var slots = slotsOn(d.date);
  return slots.length ? 'Free on ' + d.date + ': ' + slots.join(', ') + '.' : 'That day is fully booked.';
}

function appendRow(body, d) {
  var sh = SHEET_ID ? SpreadsheetApp.openById(SHEET_ID).getSheetByName(SHEET_NAME)
                    : SpreadsheetApp.getActive().getSheetByName(SHEET_NAME);
  if (!sh) throw new Error('sheet "' + SHEET_NAME + '" not found');
  if (sh.getLastRow() === 0) {
    sh.appendRow(['When', 'Company', 'Name', 'Phone', 'Email', 'Request', 'Caller ID', 'Call ID']);
  }
  sh.appendRow([new Date(), body.company || '', d.name || '', d.phone || '', d.email || '',
                d.request || d.details || '', body.caller || '', body.call_id || '']);
  return 'I have saved your details.';
}

function slotsOn(date) {
  var out = [];
  for (var h = OPEN_HOUR; h < CLOSE_HOUR; h++) {
    ['00', '30'].forEach(function (m) {
      var s = new Date(date + 'T' + h + ':' + m + ':00');
      if (s < new Date()) return;
      var e = new Date(s.getTime() + 30 * 60000);
      if (!calendar().getEvents(s, e).length) out.push(h + ':' + m);
    });
  }
  return out;
}
