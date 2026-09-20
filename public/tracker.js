/*!
 * Tiny privacy-first pageview beacon (~1KB). No cookies, no localStorage,
 * no persistent identifiers set on the visitor's device at all - the only
 * thing sent is the current page URL and the referrer, both of which the
 * browser already reveals to any site you navigate to. Nothing here can
 * identify a specific person.
 *
 * Add this once, site-wide, via Webflow's Site Settings -> Custom Code ->
 * Footer Code (so it loads on every page without editing each page).
 */
(function () {
  var ENDPOINT = 'https://REPLACE_WITH_YOUR_ANALYTICS_DOMAIN/api/event';

  // Flip to true if you want to honour the browser's "Do Not Track"
  // signal. Off by default because this script never sets cookies or
  // collects anything personally identifying in the first place.
  var RESPECT_DNT = false;

  function dntEnabled() {
    var dnt = navigator.doNotTrack || window.doNotTrack;
    return dnt === '1' || dnt === 'yes';
  }

  function send() {
    if (RESPECT_DNT && dntEnabled()) return;
    // Ignore file:// previews and localhost so dev/staging doesn't pollute stats.
    if (/^(localhost|127\.0\.0\.1)$/.test(location.hostname)) return;

    var payload = JSON.stringify({
      u: location.href,
      r: document.referrer || '',
    });

    if (navigator.sendBeacon) {
      var blob = new Blob([payload], { type: 'text/plain;charset=UTF-8' });
      navigator.sendBeacon(ENDPOINT, blob);
    } else {
      fetch(ENDPOINT, {
        method: 'POST',
        body: payload,
        keepalive: true,
        headers: { 'Content-Type': 'text/plain' },
      }).catch(function () {});
    }
  }

  // Fires on normal loads, and again on back/forward-cache restores so a
  // visitor navigating back still counts as a pageview, matching how a
  // real reload would be counted.
  window.addEventListener('pageshow', send);
})();
